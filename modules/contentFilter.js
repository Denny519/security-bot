const { Collection } = require('discord.js');
const { logger } = require('../logger.js');
const utils = require('../utils.js');

/**
 * Advanced Content Filtering System
 * Handles profanity filtering, custom word filtering, and content analysis
 */
class ContentFilter {
    constructor(options = {}) {
        this.config = {
            enabled: options.enabled !== false,
            strictMode: options.strictMode || false,
            customWords: Array.isArray(options.customWords) ? options.customWords : [],
            whitelist: Array.isArray(options.whitelist) ? options.whitelist : [],
            allowedFileTypes: Array.isArray(options.allowedFileTypes) ? options.allowedFileTypes : [
                'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
                'mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'ogg',
                'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
                'zip', 'rar', '7z', 'tar', 'gz'
            ],
            maxFileSize: options.maxFileSize || 50 * 1024 * 1024, // 50MB
            ...options
        };
        
        // Profanity word lists (multiple languages)
        this.profanityLists = {
            english: [
                // Mild profanity
                'damn', 'hell', 'crap', 'stupid', 'idiot', 'moron', 'dumb',
                // Moderate profanity  
                'shit', 'piss', 'ass', 'bitch', 'bastard', 'whore', 'slut',
                // Strong profanity
                'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker',
                'cunt', 'cock', 'dick', 'pussy', 'tits', 'boobs',
                // Hate speech
                'nigger', 'nigga', 'faggot', 'retard', 'spic', 'chink',
                'kike', 'wetback', 'towelhead', 'raghead'
            ],
            spanish: [
                'mierda', 'joder', 'coño', 'puta', 'hijo de puta', 'cabrón',
                'pendejo', 'maricón', 'gilipollas', 'imbécil'
            ],
            french: [
                'merde', 'putain', 'connard', 'salope', 'enculé', 'fils de pute',
                'con', 'bite', 'chatte', 'bordel'
            ],
            german: [
                'scheiße', 'fick', 'arsch', 'fotze', 'hurensohn', 'wichser',
                'schwanz', 'muschi', 'verdammt'
            ],
            portuguese: [
                'merda', 'caralho', 'porra', 'filho da puta', 'puta', 'cu',
                'buceta', 'cacete', 'desgraça'
            ]
        };
        
        // Severity levels for different word categories
        this.severityLevels = {
            mild: 1,      // damn, hell, crap
            moderate: 2,  // shit, ass, bitch
            strong: 3,    // fuck, cock, pussy
            extreme: 4,   // hate speech, slurs
            custom: 2     // custom filtered words
        };
        
        // Compile regex patterns for performance
        this.compiledPatterns = this.compilePatterns();
        
        // Detection cache for performance
        this.detectionCache = new Collection();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
        logger.info('Content Filter initialized', {
            enabled: this.config.enabled,
            strictMode: this.config.strictMode,
            languages: Object.keys(this.profanityLists).length,
            customWords: this.config.customWords.length
        });
    }
    
    /**
     * Compile regex patterns for better performance
     */
    compilePatterns() {
        const patterns = {};

        // Compile profanity patterns for each language
        for (const [language, words] of Object.entries(this.profanityLists)) {
            patterns[language] = [];

            for (const word of words) {
                try {
                    // Skip empty or invalid words
                    if (!word || typeof word !== 'string' || word.trim().length === 0) {
                        continue;
                    }

                    const cleanWord = word.trim();

                    // Handle multi-word phrases
                    if (cleanWord.includes(' ')) {
                        const escapedPhrase = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const flexiblePhrase = escapedPhrase.replace(/\s+/g, '\\s*');
                        const phrasePattern = new RegExp(`\\b${flexiblePhrase}\\b`, 'gi');

                        patterns[language].push({
                            exact: phrasePattern,
                            evasion: phrasePattern,
                            word: cleanWord
                        });
                        continue;
                    }

                    // Create pattern that handles common evasion techniques for single words
                    const escapedWord = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    // Apply character substitution patterns more carefully
                    let evasionPattern = escapedWord;

                    // Only apply substitutions if the character exists in the word
                    if (/[aeiou]/i.test(cleanWord)) {
                        evasionPattern = evasionPattern.replace(/[aeiou]/gi, '[aeiou@3!0]');
                    }
                    if (/s/i.test(cleanWord)) {
                        evasionPattern = evasionPattern.replace(/s/gi, '[s$5z]');
                    }
                    if (/l/i.test(cleanWord)) {
                        evasionPattern = evasionPattern.replace(/l/gi, '[l1!|]');
                    }
                    if (/o/i.test(cleanWord)) {
                        evasionPattern = evasionPattern.replace(/o/gi, '[o0@]');
                    }
                    if (/i/i.test(cleanWord)) {
                        evasionPattern = evasionPattern.replace(/i/gi, '[i1!|]');
                    }

                    // Create both exact match and evasion-resistant patterns
                    const exactRegex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
                    const evasionRegex = new RegExp(`\\b${evasionPattern}\\b`, 'gi');

                    patterns[language].push({
                        exact: exactRegex,
                        evasion: evasionRegex,
                        word: cleanWord
                    });

                } catch (error) {
                    logger.warn('Failed to compile pattern for word', { word, language, error: error.message });
                }
            }
        }

        // Compile custom word patterns
        if (this.config.customWords && this.config.customWords.length > 0) {
            patterns.custom = [];

            for (const word of this.config.customWords) {
                try {
                    // Skip empty or invalid words
                    if (!word || typeof word !== 'string' || word.trim().length === 0) {
                        continue;
                    }

                    const cleanWord = word.trim();
                    const escapedWord = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const exactPattern = new RegExp(`\\b${escapedWord}\\b`, 'gi');

                    patterns.custom.push({
                        exact: exactPattern,
                        evasion: exactPattern,
                        word: cleanWord
                    });

                } catch (error) {
                    logger.warn('Failed to compile custom word pattern', { word, error: error.message });
                }
            }
        }

        return patterns;
    }
    
    /**
     * Analyze message content for filtering
     */
    analyzeContent(message) {
        if (!this.config.enabled) {
            return { filtered: false, reason: 'Content filtering disabled' };
        }
        
        const content = message.content;
        const userId = message.author.id;
        
        // Check cache first
        const cacheKey = `${userId}-${utils.hashString(content)}`;
        const cached = this.detectionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.result;
        }
        
        const analysis = {
            filtered: false,
            severity: 0,
            detections: [],
            action: 'none',
            confidence: 0,
            language: 'unknown'
        };
        
        // Skip if user is whitelisted
        if (this.isWhitelisted(message.author)) {
            analysis.reason = 'User whitelisted';
            return analysis;
        }
        
        // Analyze text content
        const textAnalysis = this.analyzeText(content);
        if (textAnalysis.filtered) {
            analysis.filtered = true;
            analysis.severity = Math.max(analysis.severity, textAnalysis.severity);
            analysis.detections.push(...textAnalysis.detections);
            analysis.confidence += textAnalysis.confidence;
            analysis.language = textAnalysis.language;
        }
        
        // Analyze attachments if present
        if (message.attachments && message.attachments.size > 0) {
            const attachmentAnalysis = this.analyzeAttachments(message.attachments);
            if (attachmentAnalysis.filtered) {
                analysis.filtered = true;
                analysis.severity = Math.max(analysis.severity, attachmentAnalysis.severity);
                analysis.detections.push(...attachmentAnalysis.detections);
                analysis.confidence += attachmentAnalysis.confidence;
            }
        }
        
        // Determine action based on severity
        analysis.action = this.determineAction(analysis.severity, userId);
        
        // Cap confidence at 100
        analysis.confidence = Math.min(analysis.confidence, 100);
        
        // Cache result
        this.detectionCache.set(cacheKey, {
            result: analysis,
            timestamp: Date.now()
        });
        
        // Log detection if filtered
        if (analysis.filtered) {
            logger.warn('Content filtered', {
                userId,
                userTag: message.author.tag,
                severity: analysis.severity,
                detections: analysis.detections,
                action: analysis.action,
                language: analysis.language
            });
        }
        
        return analysis;
    }
    
    /**
     * Analyze text content for profanity and custom words
     */
    analyzeText(content) {
        const analysis = {
            filtered: false,
            severity: 0,
            detections: [],
            confidence: 0,
            language: 'unknown'
        };
        
        if (!content || content.trim().length === 0) {
            return analysis;
        }
        
        const normalizedContent = content.toLowerCase().trim();
        
        // Check each language's profanity list
        for (const [language, patterns] of Object.entries(this.compiledPatterns)) {
            if (language === 'custom') continue; // Handle custom words separately

            for (let i = 0; i < patterns.length; i++) {
                const patternObj = patterns[i];

                // Validate pattern object
                if (!patternObj || !patternObj.exact || !patternObj.word) {
                    logger.warn('Invalid pattern object found', { language, index: i, patternObj });
                    continue;
                }

                // Try exact match first
                let matches = normalizedContent.match(patternObj.exact);
                let matchType = 'exact';

                // If no exact match, try evasion pattern
                if (!matches && patternObj.evasion) {
                    matches = normalizedContent.match(patternObj.evasion);
                    matchType = 'evasion';
                }

                if (matches) {
                    analysis.filtered = true;
                    analysis.language = language;

                    const originalWord = patternObj.word;
                    const severity = this.getWordSeverity(originalWord);

                    analysis.severity = Math.max(analysis.severity, severity);
                    analysis.confidence += matchType === 'exact' ? 25 : 20;

                    analysis.detections.push({
                        type: 'profanity',
                        language,
                        word: originalWord,
                        matches: matches.length,
                        matchType,
                        severity
                    });

                    // In strict mode, stop at first detection
                    if (this.config.strictMode) {
                        break;
                    }
                }
            }

            if (analysis.filtered && this.config.strictMode) {
                break;
            }
        }
        
        // Check custom words
        if (this.compiledPatterns.custom && this.compiledPatterns.custom.length > 0) {
            for (let i = 0; i < this.compiledPatterns.custom.length; i++) {
                const patternObj = this.compiledPatterns.custom[i];

                // Try exact match for custom words
                const matches = normalizedContent.match(patternObj.exact);

                if (matches) {
                    analysis.filtered = true;
                    analysis.language = 'custom';

                    const customWord = patternObj.word;
                    const severity = this.severityLevels.custom;

                    analysis.severity = Math.max(analysis.severity, severity);
                    analysis.confidence += 25 * matches.length;

                    analysis.detections.push({
                        type: 'custom_word',
                        word: customWord,
                        matches: matches.length,
                        matchType: 'exact',
                        severity
                    });
                }
            }
        }
        
        return analysis;
    }
    
    /**
     * Analyze message attachments
     */
    analyzeAttachments(attachments) {
        const analysis = {
            filtered: false,
            severity: 0,
            detections: [],
            confidence: 0
        };
        
        for (const attachment of attachments.values()) {
            // Check file type
            const fileExtension = this.getFileExtension(attachment.name);
            if (!this.isAllowedFileType(fileExtension)) {
                analysis.filtered = true;
                analysis.severity = Math.max(analysis.severity, 2);
                analysis.confidence += 30;
                
                analysis.detections.push({
                    type: 'forbidden_file_type',
                    fileName: attachment.name,
                    fileType: fileExtension,
                    severity: 2
                });
            }
            
            // Check file size
            if (attachment.size > this.config.maxFileSize) {
                analysis.filtered = true;
                analysis.severity = Math.max(analysis.severity, 1);
                analysis.confidence += 20;
                
                analysis.detections.push({
                    type: 'file_too_large',
                    fileName: attachment.name,
                    fileSize: attachment.size,
                    maxSize: this.config.maxFileSize,
                    severity: 1
                });
            }
            
            // Check for suspicious file names
            const suspiciousName = this.checkSuspiciousFileName(attachment.name);
            if (suspiciousName.suspicious) {
                analysis.filtered = true;
                analysis.severity = Math.max(analysis.severity, suspiciousName.severity);
                analysis.confidence += suspiciousName.confidence;
                
                analysis.detections.push({
                    type: 'suspicious_filename',
                    fileName: attachment.name,
                    reason: suspiciousName.reason,
                    severity: suspiciousName.severity
                });
            }
        }
        
        return analysis;
    }
    
    /**
     * Check if filename is suspicious
     */
    checkSuspiciousFileName(fileName) {
        const result = {
            suspicious: false,
            severity: 0,
            confidence: 0,
            reason: ''
        };
        
        const lowerName = fileName.toLowerCase();
        
        // Check for executable files disguised as other types
        const executableExtensions = ['exe', 'bat', 'cmd', 'scr', 'com', 'pif', 'vbs', 'js'];
        const actualExtension = this.getFileExtension(fileName);
        
        if (executableExtensions.includes(actualExtension)) {
            result.suspicious = true;
            result.severity = 3;
            result.confidence = 40;
            result.reason = 'Executable file type';
        }
        
        // Check for suspicious keywords in filename
        const suspiciousKeywords = [
            'virus', 'malware', 'trojan', 'keylogger', 'hack', 'crack',
            'keygen', 'patch', 'loader', 'cheat', 'bot', 'rat'
        ];
        
        for (const keyword of suspiciousKeywords) {
            if (lowerName.includes(keyword)) {
                result.suspicious = true;
                result.severity = Math.max(result.severity, 2);
                result.confidence += 25;
                result.reason = `Contains suspicious keyword: ${keyword}`;
            }
        }
        
        // Check for very long filenames (potential buffer overflow)
        if (fileName.length > 200) {
            result.suspicious = true;
            result.severity = Math.max(result.severity, 2);
            result.confidence += 20;
            result.reason = 'Extremely long filename';
        }
        
        return result;
    }
    
    /**
     * Get file extension from filename
     */
    getFileExtension(fileName) {
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot === -1) return '';
        return fileName.substring(lastDot + 1).toLowerCase();
    }
    
    /**
     * Check if file type is allowed
     */
    isAllowedFileType(extension) {
        return this.config.allowedFileTypes.includes(extension.toLowerCase());
    }
    
    /**
     * Get severity level for a word
     */
    getWordSeverity(word) {
        if (!word || typeof word !== 'string') {
            logger.warn('getWordSeverity called with invalid word:', { word });
            return this.severityLevels.mild;
        }

        const lowerWord = word.toLowerCase();
        
        // Extreme severity (hate speech, slurs)
        const extremeWords = [
            'nigger', 'nigga', 'faggot', 'retard', 'spic', 'chink',
            'kike', 'wetback', 'towelhead', 'raghead'
        ];
        if (extremeWords.includes(lowerWord)) {
            return this.severityLevels.extreme;
        }
        
        // Strong severity
        const strongWords = [
            'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker',
            'cunt', 'cock', 'dick', 'pussy', 'tits', 'boobs'
        ];
        if (strongWords.includes(lowerWord)) {
            return this.severityLevels.strong;
        }
        
        // Moderate severity
        const moderateWords = [
            'shit', 'piss', 'ass', 'bitch', 'bastard', 'whore', 'slut'
        ];
        if (moderateWords.includes(lowerWord)) {
            return this.severityLevels.moderate;
        }
        
        // Default to mild
        return this.severityLevels.mild;
    }
    
    /**
     * Check if user is whitelisted
     */
    isWhitelisted(user) {
        return this.config.whitelist.includes(user.id) || 
               this.config.whitelist.includes(user.tag);
    }
    
    /**
     * Determine action based on severity and user history
     */
    determineAction(severity, userId = null) {
        // Get user's violation history (would integrate with database)
        // For now, we'll use a placeholder - in production this would query the database
        const violationCount = 0; // TODO: Implement database lookup for user violations

        // Log the determination for debugging
        if (userId) {
            logger.debug('Determining action for content violation', {
                userId,
                severity,
                violationCount
            });
        }

        if (severity >= 4 || violationCount >= 5) {
            return 'ban';
        } else if (severity >= 3 || violationCount >= 3) {
            return 'kick';
        } else if (severity >= 2 || violationCount >= 2) {
            return 'timeout';
        } else if (severity >= 1 || violationCount >= 1) {
            return 'warn';
        }

        return 'delete';
    }
    
    /**
     * Add custom word to filter
     */
    addCustomWord(word) {
        if (!this.config.customWords.includes(word)) {
            this.config.customWords.push(word);
            this.compiledPatterns = this.compilePatterns(); // Recompile patterns
            
            logger.info('Custom word added to filter', { word });
            return true;
        }
        return false;
    }
    
    /**
     * Remove custom word from filter
     */
    removeCustomWord(word) {
        const index = this.config.customWords.indexOf(word);
        if (index !== -1) {
            this.config.customWords.splice(index, 1);
            this.compiledPatterns = this.compilePatterns(); // Recompile patterns
            
            logger.info('Custom word removed from filter', { word });
            return true;
        }
        return false;
    }
    
    /**
     * Add user to whitelist
     */
    addToWhitelist(userIdOrTag) {
        if (!this.config.whitelist.includes(userIdOrTag)) {
            this.config.whitelist.push(userIdOrTag);
            logger.info('User added to content filter whitelist', { user: userIdOrTag });
            return true;
        }
        return false;
    }
    
    /**
     * Remove user from whitelist
     */
    removeFromWhitelist(userIdOrTag) {
        const index = this.config.whitelist.indexOf(userIdOrTag);
        if (index !== -1) {
            this.config.whitelist.splice(index, 1);
            logger.info('User removed from content filter whitelist', { user: userIdOrTag });
            return true;
        }
        return false;
    }
    
    /**
     * Clean up cache
     */
    cleanup() {
        const now = Date.now();
        const toDelete = [];
        
        for (const [key, data] of this.detectionCache.entries()) {
            if (now - data.timestamp > this.cacheTimeout) {
                toDelete.push(key);
            }
        }
        
        toDelete.forEach(key => this.detectionCache.delete(key));
        
        logger.debug('Content filter cleanup completed', {
            cacheSize: this.detectionCache.size,
            cleaned: toDelete.length
        });
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            enabled: this.config.enabled,
            strictMode: this.config.strictMode,
            languages: Object.keys(this.profanityLists).length,
            totalWords: Object.values(this.profanityLists).reduce((sum, words) => sum + words.length, 0),
            customWords: this.config.customWords.length,
            whitelistedUsers: this.config.whitelist.length,
            cacheSize: this.detectionCache.size,
            allowedFileTypes: this.config.allowedFileTypes.length
        };
    }
}

module.exports = ContentFilter;
