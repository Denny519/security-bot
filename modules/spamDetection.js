const { Collection } = require('discord.js');
const utils = require('../utils.js');
const { logger } = require('../logger.js');

/**
 * Advanced spam detection module
 */
class SpamDetection {
    constructor(config) {
        this.config = config;
        this.userMessages = new Collection(); // userId -> array of message data
        this.userViolations = new Collection(); // userId -> violation data
        this.suspiciousPatterns = new Collection(); // pattern -> count
        
        // Spam detection patterns
        this.patterns = {
            repeatedChars: /(.)\1{4,}/g,
            capsLock: /[A-Z]{10,}/g,
            excessiveEmojis: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu,
            zalgoText: /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF]/g,
            invisibleChars: /[\u200B-\u200D\uFEFF]/g
        };
    }
    
    /**
     * Analyze message for spam indicators
     * @param {Object} message - Discord message object
     * @returns {Object} - Analysis result
     */
    analyzeMessage(message) {
        const userId = message.author.id;
        const content = message.content;
        const now = Date.now();
        
        const analysis = {
            isSpam: false,
            confidence: 0,
            reasons: [],
            action: 'none', // none, warn, timeout, kick, ban
            severity: 0 // 0-100
        };
        
        // Get user's message history
        if (!this.userMessages.has(userId)) {
            this.userMessages.set(userId, []);
        }
        
        const userHistory = this.userMessages.get(userId);
        
        // Clean old messages (older than 5 minutes)
        const fiveMinutesAgo = now - (5 * 60 * 1000);
        const recentMessages = userHistory.filter(msg => msg.timestamp > fiveMinutesAgo);
        
        // Add current message to history
        recentMessages.push({
            content,
            timestamp: now,
            channelId: message.channel?.id || 'unknown'
        });
        
        this.userMessages.set(userId, recentMessages);
        
        // 1. Duplicate message detection
        const duplicateAnalysis = this.checkDuplicateMessages(recentMessages, content);
        if (duplicateAnalysis.isSpam) {
            analysis.isSpam = true;
            analysis.confidence += duplicateAnalysis.confidence;
            analysis.reasons.push(...duplicateAnalysis.reasons);
            analysis.severity += duplicateAnalysis.severity;
        }
        
        // 2. Message frequency analysis
        const frequencyAnalysis = this.checkMessageFrequency(recentMessages, now);
        if (frequencyAnalysis.isSpam) {
            analysis.isSpam = true;
            analysis.confidence += frequencyAnalysis.confidence;
            analysis.reasons.push(...frequencyAnalysis.reasons);
            analysis.severity += frequencyAnalysis.severity;
        }
        
        // 3. Content pattern analysis
        const patternAnalysis = this.checkContentPatterns(content);
        if (patternAnalysis.isSpam) {
            analysis.isSpam = true;
            analysis.confidence += patternAnalysis.confidence;
            analysis.reasons.push(...patternAnalysis.reasons);
            analysis.severity += patternAnalysis.severity;
        }
        
        // 4. Similarity analysis with recent messages
        const similarityAnalysis = this.checkMessageSimilarity(recentMessages, content);
        if (similarityAnalysis.isSpam) {
            analysis.isSpam = true;
            analysis.confidence += similarityAnalysis.confidence;
            analysis.reasons.push(...similarityAnalysis.reasons);
            analysis.severity += similarityAnalysis.severity;
        }
        
        // Determine action based on severity and user history
        analysis.action = this.determineAction(userId, analysis.severity);
        
        // Cap confidence at 100
        analysis.confidence = Math.min(analysis.confidence, 100);
        
        return analysis;
    }
    
    /**
     * Check for duplicate messages
     */
    checkDuplicateMessages(messages, currentContent) {
        const result = { isSpam: false, confidence: 0, reasons: [], severity: 0 };
        
        const duplicateCount = messages.filter(msg => msg.content === currentContent).length;
        
        if (duplicateCount > this.config.spam.maxDuplicateMessages) {
            result.isSpam = true;
            result.confidence = Math.min(duplicateCount * 20, 80);
            result.reasons.push(`Duplicate message (${duplicateCount} times)`);
            result.severity = Math.min(duplicateCount * 15, 60);
        }
        
        return result;
    }
    
    /**
     * Check message frequency
     */
    checkMessageFrequency(messages, now) {
        const result = { isSpam: false, confidence: 0, reasons: [], severity: 0 };
        
        // Check messages in last minute
        const oneMinuteAgo = now - 60000;
        const recentCount = messages.filter(msg => msg.timestamp > oneMinuteAgo).length;
        
        if (recentCount > this.config.spam.maxMessagesPerMinute) {
            result.isSpam = true;
            result.confidence = Math.min((recentCount - this.config.spam.maxMessagesPerMinute) * 10, 70);
            result.reasons.push(`Message flooding (${recentCount} messages/minute)`);
            result.severity = Math.min((recentCount - this.config.spam.maxMessagesPerMinute) * 8, 50);
        }
        
        // Check burst messaging (5+ messages in 10 seconds)
        const tenSecondsAgo = now - 10000;
        const burstCount = messages.filter(msg => msg.timestamp > tenSecondsAgo).length;
        
        if (burstCount >= 5) {
            result.isSpam = true;
            result.confidence += Math.min(burstCount * 8, 40);
            result.reasons.push(`Burst messaging (${burstCount} messages in 10s)`);
            result.severity += Math.min(burstCount * 6, 30);
        }
        
        return result;
    }
    
    /**
     * Check content patterns
     */
    checkContentPatterns(content) {
        const result = { isSpam: false, confidence: 0, reasons: [], severity: 0 };
        
        // Check repeated characters
        const repeatedMatches = content.match(this.patterns.repeatedChars);
        if (repeatedMatches && repeatedMatches.length > 0) {
            result.isSpam = true;
            result.confidence += 25;
            result.reasons.push('Excessive repeated characters');
            result.severity += 20;
        }
        
        // Check excessive caps
        const capsMatches = content.match(this.patterns.capsLock);
        if (capsMatches && content.length > 20) {
            const capsRatio = capsMatches.join('').length / content.length;
            if (capsRatio > 0.7) {
                result.isSpam = true;
                result.confidence += 20;
                result.reasons.push('Excessive caps lock');
                result.severity += 15;
            }
        }
        
        // Check excessive emojis
        const emojiMatches = content.match(this.patterns.excessiveEmojis);
        if (emojiMatches && emojiMatches.length > 10) {
            result.isSpam = true;
            result.confidence += 30;
            result.reasons.push(`Excessive emojis (${emojiMatches.length})`);
            result.severity += 25;
        }
        
        // Check zalgo text (corrupted text)
        const zalgoMatches = content.match(this.patterns.zalgoText);
        if (zalgoMatches && zalgoMatches.length > 20) {
            result.isSpam = true;
            result.confidence += 40;
            result.reasons.push('Zalgo/corrupted text detected');
            result.severity += 35;
        }
        
        // Check invisible characters
        const invisibleMatches = content.match(this.patterns.invisibleChars);
        if (invisibleMatches && invisibleMatches.length > 5) {
            result.isSpam = true;
            result.confidence += 35;
            result.reasons.push('Invisible character spam');
            result.severity += 30;
        }
        
        return result;
    }
    
    /**
     * Check message similarity
     */
    checkMessageSimilarity(messages, currentContent) {
        const result = { isSpam: false, confidence: 0, reasons: [], severity: 0 };
        
        if (messages.length < 2) return result;
        
        // Check similarity with recent messages
        const recentMessages = messages.slice(-5); // Last 5 messages
        let maxSimilarity = 0;
        let similarCount = 0;
        
        for (const msg of recentMessages) {
            if (msg.content === currentContent) continue; // Skip exact duplicates (handled elsewhere)
            
            const similarity = utils.calculateSimilarity(msg.content, currentContent);
            maxSimilarity = Math.max(maxSimilarity, similarity);
            
            if (similarity > 0.8) {
                similarCount++;
            }
        }
        
        if (maxSimilarity > 0.85 || similarCount >= 2) {
            result.isSpam = true;
            result.confidence = Math.min(maxSimilarity * 60, 50);
            result.reasons.push(`Similar messages detected (${Math.round(maxSimilarity * 100)}% similarity)`);
            result.severity = Math.min(maxSimilarity * 40, 35);
        }
        
        return result;
    }
    
    /**
     * Determine moderation action based on severity and user history
     */
    determineAction(userId, severity) {
        const violations = this.getUserViolations(userId);
        
        // Progressive punishment based on violation count and severity
        if (severity >= 80 || violations.count >= 5) {
            return 'ban';
        } else if (severity >= 60 || violations.count >= 3) {
            return 'kick';
        } else if (severity >= 40 || violations.count >= 2) {
            return 'timeout';
        } else if (severity >= 20 || violations.count >= 1) {
            return 'warn';
        }
        
        return 'none';
    }
    
    /**
     * Get user violations
     */
    getUserViolations(userId) {
        return this.userViolations.get(userId) || { count: 0, lastViolation: 0 };
    }
    
    /**
     * Add violation for user
     */
    addViolation(userId, reason, severity) {
        const violations = this.getUserViolations(userId);
        violations.count++;
        violations.lastViolation = Date.now();
        violations.lastReason = reason;
        violations.lastSeverity = severity;
        
        this.userViolations.set(userId, violations);
        
        logger.info('Spam violation recorded', {
            userId,
            violationCount: violations.count,
            reason,
            severity
        });
        
        return violations;
    }
    
    /**
     * Clean up old data
     */
    cleanup() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const fiveMinutes = 5 * 60 * 1000;
        
        // Clean old message history
        for (const [userId, messages] of this.userMessages.entries()) {
            const recentMessages = messages.filter(msg => now - msg.timestamp < fiveMinutes);
            if (recentMessages.length === 0) {
                this.userMessages.delete(userId);
            } else {
                this.userMessages.set(userId, recentMessages);
            }
        }
        
        // Clean old violations (more efficient)
        const violationsToDelete = [];
        for (const [userId, violation] of this.userViolations.entries()) {
            if (now - violation.lastViolation > oneHour) {
                violationsToDelete.push(userId);
            }
        }
        violationsToDelete.forEach(userId => this.userViolations.delete(userId));
        
        // Clean suspicious patterns
        this.suspiciousPatterns.clear();
        
        logger.debug('Spam detection cleanup completed', {
            activeUsers: this.userMessages.size,
            violatedUsers: this.userViolations.size
        });
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            activeUsers: this.userMessages.size,
            violatedUsers: this.userViolations.size,
            suspiciousPatterns: this.suspiciousPatterns.size,
            totalMessages: Array.from(this.userMessages.values()).reduce((total, messages) => total + messages.length, 0)
        };
    }
}

module.exports = SpamDetection;
