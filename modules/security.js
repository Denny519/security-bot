const { Collection } = require('discord.js');
const utils = require('../utils.js');
const { logger } = require('../logger.js');

/**
 * Enhanced security module for the Security Bot
 */
class SecurityModule {
    constructor(config) {
        this.config = config;
        this.suspiciousUsers = new Collection(); // userId -> suspicion data
        this.raidDetection = new Collection(); // guildId -> raid data
        this.ipTracker = new Collection(); // IP patterns for VPN/proxy detection
        this.accountAgeTracker = new Collection(); // userId -> account data
        
        // Security patterns
        this.suspiciousPatterns = {
            // Common bot/spam account patterns
            usernamePatterns: [
                /^[a-z]+\d{4,}$/i, // letters followed by 4+ numbers
                /^user\d+$/i,      // "user" followed by numbers
                /^[a-z]{1,3}\d{8,}$/i, // 1-3 letters + 8+ numbers
                /discord\.gg/i,    // Discord invite in username
                /nitro/i,          // Nitro scam related
                /free/i            // Free stuff scams
            ],
            
            // Suspicious message patterns
            messagePatterns: [
                /discord\.gg\/[a-zA-Z0-9]+/g,  // Discord invites
                /nitro.*free/gi,               // Free nitro scams
                /click.*link/gi,               // Click link scams
                /dm.*me/gi,                    // DM me requests
                /check.*dm/gi,                 // Check DM requests
                /@everyone|@here/g             // Mass mentions
            ]
        };
    }
    
    /**
     * Analyze user for security risks
     * @param {Object} user - Discord user object
     * @param {Object} guild - Discord guild object
     * @returns {Object} - Security analysis result
     */
    analyzeUser(user, guild) {
        const analysis = {
            riskLevel: 'low', // low, medium, high, critical
            riskScore: 0,     // 0-100
            flags: [],
            recommendations: []
        };
        
        // Check account age
        const accountAge = Date.now() - user.createdTimestamp;
        const accountAgeHours = accountAge / (1000 * 60 * 60);
        
        if (accountAgeHours < 1) {
            analysis.riskScore += 40;
            analysis.flags.push('Very new account (< 1 hour)');
            analysis.recommendations.push('Monitor closely for spam/raid activity');
        } else if (accountAgeHours < 24) {
            analysis.riskScore += 25;
            analysis.flags.push('New account (< 24 hours)');
            analysis.recommendations.push('Watch for suspicious behavior');
        } else if (accountAgeHours < 168) { // 1 week
            analysis.riskScore += 10;
            analysis.flags.push('Recent account (< 1 week)');
        }
        
        // Check username patterns
        for (const pattern of this.suspiciousPatterns.usernamePatterns) {
            if (pattern.test(user.username)) {
                analysis.riskScore += 15;
                analysis.flags.push('Suspicious username pattern');
                break;
            }
        }
        
        // Check if user has default avatar
        if (!user.avatar) {
            analysis.riskScore += 10;
            analysis.flags.push('Default avatar');
        }
        
        // Check if user has no discriminator (new username system)
        if (user.discriminator === '0') {
            analysis.riskScore -= 5; // Slightly less suspicious for new system
        }
        
        // Check for suspicious user ID patterns (some bot farms use sequential IDs)
        const userId = BigInt(user.id);
        const timestamp = (userId >> 22n) + 1420070400000n;
        const userCreationTime = new Date(Number(timestamp));
        
        // Check if creation time matches account creation time (basic validation)
        const timeDiff = Math.abs(userCreationTime.getTime() - user.createdTimestamp);
        if (timeDiff > 60000) { // More than 1 minute difference
            analysis.riskScore += 20;
            analysis.flags.push('ID timestamp mismatch');
        }
        
        // Determine risk level
        if (analysis.riskScore >= 70) {
            analysis.riskLevel = 'critical';
        } else if (analysis.riskScore >= 50) {
            analysis.riskLevel = 'high';
        } else if (analysis.riskScore >= 25) {
            analysis.riskLevel = 'medium';
        }
        
        // Store analysis for tracking
        this.accountAgeTracker.set(user.id, {
            accountAge: accountAgeHours,
            riskScore: analysis.riskScore,
            riskLevel: analysis.riskLevel,
            analyzedAt: Date.now()
        });
        
        return analysis;
    }
    
    /**
     * Analyze message for security threats
     * @param {Object} message - Discord message object
     * @returns {Object} - Security analysis result
     */
    analyzeMessage(message) {
        const analysis = {
            threatLevel: 'none', // none, low, medium, high, critical
            threatScore: 0,      // 0-100
            threats: [],
            actions: []
        };
        
        const content = message.content;
        
        // Check for Discord invite links
        const inviteMatches = content.match(this.suspiciousPatterns.messagePatterns[0]);
        if (inviteMatches) {
            analysis.threatScore += 30;
            analysis.threats.push(`Discord invite detected (${inviteMatches.length} links)`);
            analysis.actions.push('Delete message and warn user');
        }
        
        // Check for nitro scams
        if (this.suspiciousPatterns.messagePatterns[1].test(content)) {
            analysis.threatScore += 50;
            analysis.threats.push('Potential nitro scam');
            analysis.actions.push('Delete message and timeout user');
        }
        
        // Check for phishing attempts
        if (this.suspiciousPatterns.messagePatterns[2].test(content)) {
            analysis.threatScore += 40;
            analysis.threats.push('Potential phishing attempt');
            analysis.actions.push('Delete message and warn user');
        }
        
        // Check for DM requests (often used for scams)
        if (this.suspiciousPatterns.messagePatterns[3].test(content) || 
            this.suspiciousPatterns.messagePatterns[4].test(content)) {
            analysis.threatScore += 25;
            analysis.threats.push('Suspicious DM request');
            analysis.actions.push('Monitor user activity');
        }
        
        // Check for mass mentions
        const mentionMatches = content.match(this.suspiciousPatterns.messagePatterns[5]);
        if (mentionMatches) {
            analysis.threatScore += 35;
            analysis.threats.push('Mass mention detected');
            analysis.actions.push('Delete message and timeout user');
        }
        
        // Check for suspicious URLs
        const urls = utils.extractUrls(content);
        for (const url of urls) {
            if (this.isSuspiciousUrl(url)) {
                analysis.threatScore += 45;
                analysis.threats.push('Suspicious URL detected');
                analysis.actions.push('Delete message and ban user');
            }
        }
        
        // Determine threat level
        if (analysis.threatScore >= 80) {
            analysis.threatLevel = 'critical';
        } else if (analysis.threatScore >= 60) {
            analysis.threatLevel = 'high';
        } else if (analysis.threatScore >= 30) {
            analysis.threatLevel = 'medium';
        } else if (analysis.threatScore > 0) {
            analysis.threatLevel = 'low';
        }
        
        return analysis;
    }
    
    /**
     * Detect potential raid activity
     * @param {Object} guild - Discord guild object
     * @param {Object} member - New member who joined
     * @returns {Object} - Raid detection result
     */
    detectRaid(guild, member) {
        const guildId = guild.id;
        const now = Date.now();
        
        if (!this.raidDetection.has(guildId)) {
            this.raidDetection.set(guildId, {
                recentJoins: [],
                suspiciousJoins: 0,
                lastRaidAlert: 0
            });
        }
        
        const raidData = this.raidDetection.get(guildId);
        
        // Clean old join data (older than 10 minutes)
        const tenMinutesAgo = now - (10 * 60 * 1000);
        raidData.recentJoins = raidData.recentJoins.filter(join => join.timestamp > tenMinutesAgo);
        
        // Add current join
        const userAnalysis = this.analyzeUser(member.user, guild);
        raidData.recentJoins.push({
            userId: member.id,
            timestamp: now,
            riskScore: userAnalysis.riskScore,
            accountAge: Date.now() - member.user.createdTimestamp
        });
        
        // Analyze for raid patterns
        const analysis = {
            isRaid: false,
            confidence: 0,
            joinCount: raidData.recentJoins.length,
            suspiciousCount: 0,
            averageRisk: 0,
            recommendations: []
        };
        
        // Count suspicious joins
        analysis.suspiciousCount = raidData.recentJoins.filter(join => join.riskScore > 30).length;
        analysis.averageRisk = raidData.recentJoins.reduce((sum, join) => sum + join.riskScore, 0) / raidData.recentJoins.length;
        
        // Check for raid indicators
        if (analysis.joinCount >= this.config.raidProtection.joinThreshold) {
            analysis.confidence += 30;
            
            // High number of suspicious accounts
            if (analysis.suspiciousCount >= analysis.joinCount * 0.6) {
                analysis.confidence += 40;
                analysis.recommendations.push('Enable verification requirements');
            }
            
            // High average risk score
            if (analysis.averageRisk > 40) {
                analysis.confidence += 30;
                analysis.recommendations.push('Temporarily restrict new member permissions');
            }
            
            // Very new accounts
            const newAccountCount = raidData.recentJoins.filter(join => join.accountAge < 86400000).length; // 24 hours
            if (newAccountCount >= analysis.joinCount * 0.7) {
                analysis.confidence += 35;
                analysis.recommendations.push('Implement account age requirements');
            }
        }
        
        if (analysis.confidence >= 60) {
            analysis.isRaid = true;
            analysis.recommendations.push('Consider enabling server lockdown');
            
            // Prevent spam alerts
            if (now - raidData.lastRaidAlert > 300000) { // 5 minutes
                raidData.lastRaidAlert = now;
                
                logger.warn('Potential raid detected', {
                    guildId,
                    guildName: guild.name,
                    joinCount: analysis.joinCount,
                    suspiciousCount: analysis.suspiciousCount,
                    averageRisk: analysis.averageRisk,
                    confidence: analysis.confidence
                });
            }
        }
        
        this.raidDetection.set(guildId, raidData);
        return analysis;
    }
    
    /**
     * Check if URL is suspicious
     * @param {string} url - URL to check
     * @returns {boolean} - True if suspicious
     */
    isSuspiciousUrl(url) {
        const suspiciousDomains = [
            'bit.ly', 'tinyurl.com', 'short.link', 't.co',
            'discord-nitro.com', 'discordnitro.com', 'discord-gift.com',
            'steamcommunity.ru', 'steamcommunity.tk', 'steamcommunity.ml'
        ];
        
        const suspiciousKeywords = [
            'free-nitro', 'discord-nitro', 'nitro-gift', 'steam-gift',
            'free-robux', 'robux-generator', 'minecraft-free'
        ];
        
        const lowerUrl = url.toLowerCase();
        
        // Check suspicious domains
        for (const domain of suspiciousDomains) {
            if (lowerUrl.includes(domain)) {
                return true;
            }
        }
        
        // Check suspicious keywords
        for (const keyword of suspiciousKeywords) {
            if (lowerUrl.includes(keyword)) {
                return true;
            }
        }
        
        // Check for IP addresses (often used for malicious purposes)
        const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
        if (ipPattern.test(url)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Clean up old data
     */
    cleanup() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * 60 * 60 * 1000;
        
        // Clean old suspicious user data
        this.suspiciousUsers.sweep(data => now - data.lastActivity > oneHour);
        
        // Clean old account age data
        this.accountAgeTracker.sweep(data => now - data.analyzedAt > oneDay);
        
        // Clean old raid detection data
        for (const [guildId, raidData] of this.raidDetection.entries()) {
            const tenMinutesAgo = now - (10 * 60 * 1000);
            raidData.recentJoins = raidData.recentJoins.filter(join => join.timestamp > tenMinutesAgo);
            
            if (raidData.recentJoins.length === 0) {
                this.raidDetection.delete(guildId);
            }
        }
        
        logger.debug('Security module cleanup completed', {
            suspiciousUsers: this.suspiciousUsers.size,
            trackedAccounts: this.accountAgeTracker.size,
            activeRaidDetection: this.raidDetection.size
        });
    }
    
    /**
     * Get security statistics
     */
    getStats() {
        return {
            suspiciousUsers: this.suspiciousUsers.size,
            trackedAccounts: this.accountAgeTracker.size,
            activeRaidDetection: this.raidDetection.size,
            totalRaidJoins: Array.from(this.raidDetection.values())
                .reduce((total, data) => total + data.recentJoins.length, 0)
        };
    }
}

module.exports = SecurityModule;
