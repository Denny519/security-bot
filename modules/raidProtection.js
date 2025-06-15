const { Collection } = require('discord.js');
const { logger } = require('../logger.js');
const utils = require('../utils.js');

/**
 * Advanced Raid Protection System
 * Monitors join patterns, account ages, and suspicious activities
 */
class RaidProtection {
    constructor(options = {}) {
        this.joinTracker = new Collection(); // guildId -> join data
        this.suspiciousUsers = new Collection(); // userId -> suspicion data
        this.lockdownStatus = new Collection(); // guildId -> lockdown info
        this.raidEvents = new Collection(); // guildId -> raid events
        
        // Configuration
        this.config = {
            joinThreshold: options.joinThreshold || 5, // joins per timeWindow
            timeWindow: options.timeWindow || 60000, // 1 minute
            accountAgeThreshold: options.accountAgeThreshold || 7 * 24 * 60 * 60 * 1000, // 7 days
            suspicionThreshold: options.suspicionThreshold || 3, // suspicion points
            lockdownDuration: options.lockdownDuration || 10 * 60 * 1000, // 10 minutes
            cleanupInterval: options.cleanupInterval || 5 * 60 * 1000, // 5 minutes
            ...options
        };
        
        // Start cleanup interval
        this.startCleanup();
        
        logger.info('Raid Protection initialized', {
            joinThreshold: this.config.joinThreshold,
            timeWindow: this.config.timeWindow,
            accountAgeThreshold: this.config.accountAgeThreshold
        });
    }
    
    /**
     * Monitor user join for raid detection
     */
    async monitorJoin(member, guildConfig) {
        const guild = member.guild;
        const user = member.user;
        const now = Date.now();
        
        try {
            // Skip if raid protection is disabled
            if (!guildConfig.raidProtection?.enabled) {
                return { action: 'none', reason: 'Raid protection disabled' };
            }
            
            // Initialize guild tracking if needed
            if (!this.joinTracker.has(guild.id)) {
                this.joinTracker.set(guild.id, {
                    joins: [],
                    lastRaidCheck: now,
                    raidActive: false
                });
            }
            
            const guildData = this.joinTracker.get(guild.id);
            
            // Add current join
            guildData.joins.push({
                userId: user.id,
                username: user.username,
                discriminator: user.discriminator,
                accountCreated: user.createdAt,
                joinedAt: now,
                avatar: user.avatar,
                suspicious: false
            });
            
            // Clean old joins outside time window
            const timeWindow = guildConfig.raidProtection.timeWindow || this.config.timeWindow;
            guildData.joins = guildData.joins.filter(join => 
                now - join.joinedAt < timeWindow
            );
            
            // Analyze current join
            const analysis = await this.analyzeJoin(member, guildData, guildConfig);
            
            // Check for raid conditions
            const raidCheck = this.checkRaidConditions(guildData, guildConfig);
            
            // Handle raid detection
            if (raidCheck.isRaid && !guildData.raidActive) {
                await this.handleRaidDetection(guild, guildData, raidCheck, guildConfig);
            }
            
            // Handle suspicious user
            if (analysis.suspicious) {
                await this.handleSuspiciousUser(member, analysis, guildConfig);
            }
            
            // Log join event
            this.logJoinEvent(guild.id, user, analysis, raidCheck);
            
            return {
                action: analysis.action,
                reason: analysis.reason,
                suspicious: analysis.suspicious,
                raidDetected: raidCheck.isRaid,
                riskScore: analysis.riskScore
            };
            
        } catch (error) {
            logger.error('Error in raid protection monitoring:', {
                error: error.message,
                guildId: guild.id,
                userId: user.id
            });
            return { action: 'error', reason: 'Raid protection error' };
        }
    }
    
    /**
     * Analyze individual join for suspicious patterns
     */
    async analyzeJoin(member, guildData, guildConfig) {
        const user = member.user;
        const now = Date.now();
        let riskScore = 0;
        let suspicious = false;
        let reasons = [];
        let action = 'none';
        
        // Account age analysis
        const accountAge = now - user.createdAt.getTime();
        const minAccountAge = guildConfig.raidProtection.accountAge?.minimumAge || this.config.accountAgeThreshold;
        
        if (accountAge < minAccountAge) {
            riskScore += 30;
            reasons.push(`New account (${utils.formatDuration(accountAge)} old)`);
            
            if (guildConfig.raidProtection.accountAge?.enabled) {
                suspicious = true;
                action = guildConfig.raidProtection.accountAge.action || 'warn';
            }
        }
        
        // Username pattern analysis
        const usernameAnalysis = this.analyzeUsername(user.username);
        if (usernameAnalysis.suspicious) {
            riskScore += usernameAnalysis.score;
            reasons.push(...usernameAnalysis.reasons);
            suspicious = true;
        }
        
        // Avatar analysis
        if (!user.avatar) {
            riskScore += 10;
            reasons.push('Default avatar');
        }
        
        // Similar username detection
        const similarUsers = this.findSimilarUsernames(user.username, guildData.joins);
        if (similarUsers.length > 0) {
            riskScore += similarUsers.length * 15;
            reasons.push(`Similar to ${similarUsers.length} recent joins`);
            suspicious = true;
        }
        
        // Rapid join pattern detection
        const recentJoins = guildData.joins.filter(join => 
            now - join.joinedAt < 30000 // 30 seconds
        );
        if (recentJoins.length >= 3) {
            riskScore += 25;
            reasons.push('Part of rapid join pattern');
            suspicious = true;
        }
        
        // Determine final action based on risk score
        if (riskScore >= 70) {
            action = 'ban';
        } else if (riskScore >= 50) {
            action = 'kick';
        } else if (riskScore >= 30) {
            action = 'warn';
        }
        
        return {
            riskScore,
            suspicious,
            reasons,
            action,
            reason: reasons.join(', ')
        };
    }
    
    /**
     * Analyze username for suspicious patterns
     */
    analyzeUsername(username) {
        let score = 0;
        let reasons = [];
        let suspicious = false;
        
        // Random character patterns
        if (/^[a-z]+\d{4,}$/.test(username)) {
            score += 20;
            reasons.push('Random username pattern');
            suspicious = true;
        }
        
        // Excessive numbers
        const numberCount = (username.match(/\d/g) || []).length;
        if (numberCount > username.length * 0.5) {
            score += 15;
            reasons.push('Excessive numbers in username');
            suspicious = true;
        }
        
        // Very short or very long usernames
        if (username.length <= 3) {
            score += 10;
            reasons.push('Very short username');
        } else if (username.length >= 20) {
            score += 10;
            reasons.push('Very long username');
        }
        
        // Common bot patterns
        const botPatterns = [
            /user\d+/i,
            /member\d+/i,
            /guest\d+/i,
            /temp\d+/i,
            /test\d+/i
        ];
        
        for (const pattern of botPatterns) {
            if (pattern.test(username)) {
                score += 25;
                reasons.push('Bot-like username pattern');
                suspicious = true;
                break;
            }
        }
        
        return { score, reasons, suspicious };
    }
    
    /**
     * Find users with similar usernames
     */
    findSimilarUsernames(username, recentJoins) {
        const similar = [];
        const threshold = 0.8; // 80% similarity
        
        for (const join of recentJoins) {
            if (join.username === username) continue;
            
            const similarity = this.calculateStringSimilarity(username, join.username);
            if (similarity >= threshold) {
                similar.push({
                    username: join.username,
                    similarity,
                    userId: join.userId
                });
            }
        }
        
        return similar;
    }
    
    /**
     * Calculate string similarity using Levenshtein distance
     */
    calculateStringSimilarity(str1, str2) {
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;
        
        for (let i = 0; i <= len2; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= len1; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= len2; i++) {
            for (let j = 1; j <= len1; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        const distance = matrix[len2][len1];
        const maxLength = Math.max(len1, len2);
        return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
    }
    
    /**
     * Check for raid conditions
     */
    checkRaidConditions(guildData, guildConfig) {
        const now = Date.now();
        const timeWindow = guildConfig.raidProtection.timeWindow || this.config.timeWindow;
        const joinThreshold = guildConfig.raidProtection.joinThreshold || this.config.joinThreshold;
        
        // Count recent joins
        const recentJoins = guildData.joins.filter(join => 
            now - join.joinedAt < timeWindow
        );
        
        // Check join rate
        const isRaid = recentJoins.length >= joinThreshold;
        
        // Additional raid indicators
        let raidScore = 0;
        let indicators = [];
        
        if (isRaid) {
            raidScore += 50;
            indicators.push(`${recentJoins.length} joins in ${utils.formatDuration(timeWindow)}`);
        }
        
        // Check for suspicious patterns in recent joins
        const suspiciousJoins = recentJoins.filter(join => join.suspicious);
        if (suspiciousJoins.length >= 2) {
            raidScore += 30;
            indicators.push(`${suspiciousJoins.length} suspicious accounts`);
        }
        
        // Check for similar usernames
        const uniqueUsernames = new Set(recentJoins.map(join => join.username));
        if (recentJoins.length - uniqueUsernames.size >= 2) {
            raidScore += 25;
            indicators.push('Similar usernames detected');
        }
        
        // Check for new accounts
        const newAccounts = recentJoins.filter(join => {
            const accountAge = now - join.accountCreated.getTime();
            return accountAge < this.config.accountAgeThreshold;
        });
        
        if (newAccounts.length >= 3) {
            raidScore += 20;
            indicators.push(`${newAccounts.length} new accounts`);
        }
        
        return {
            isRaid,
            raidScore,
            indicators,
            recentJoins: recentJoins.length,
            suspiciousJoins: suspiciousJoins.length,
            timeWindow
        };
    }
    
    /**
     * Handle raid detection
     */
    async handleRaidDetection(guild, guildData, raidCheck, guildConfig) {
        try {
            logger.warn('Raid detected', {
                guildId: guild.id,
                guildName: guild.name,
                recentJoins: raidCheck.recentJoins,
                raidScore: raidCheck.raidScore,
                indicators: raidCheck.indicators
            });
            
            guildData.raidActive = true;
            guildData.raidStarted = Date.now();
            
            // Store raid event
            this.raidEvents.set(`${guild.id}-${Date.now()}`, {
                guildId: guild.id,
                startTime: Date.now(),
                joinCount: raidCheck.recentJoins,
                raidScore: raidCheck.raidScore,
                indicators: raidCheck.indicators,
                actions: []
            });
            
            const actions = guildConfig.raidProtection.actions || {};
            
            // Execute configured actions
            if (actions.lockdown) {
                await this.activateLockdown(guild, guildConfig);
            }
            
            if (actions.kickNewMembers) {
                await this.kickRecentJoins(guild, guildData);
            }
            
            if (actions.notifyModerators) {
                await this.notifyModerators(guild, raidCheck, guildConfig);
            }
            
            // Log to database if available
            if (guild.client.database) {
                await guild.client.database.run(
                    `INSERT INTO security_events 
                    (guild_id, event_type, severity, description, metadata) 
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        guild.id,
                        'RAID_DETECTED',
                        'high',
                        `Raid detected: ${raidCheck.recentJoins} joins, score ${raidCheck.raidScore}`,
                        JSON.stringify({
                            raidScore: raidCheck.raidScore,
                            indicators: raidCheck.indicators,
                            recentJoins: raidCheck.recentJoins
                        })
                    ]
                );
            }
            
        } catch (error) {
            logger.error('Error handling raid detection:', {
                error: error.message,
                guildId: guild.id
            });
        }
    }
    
    /**
     * Handle suspicious user
     */
    async handleSuspiciousUser(member, analysis, guildConfig) {
        const guild = member.guild;
        const user = member.user;
        
        try {
            // Store suspicion data
            this.suspiciousUsers.set(user.id, {
                userId: user.id,
                guildId: guild.id,
                riskScore: analysis.riskScore,
                reasons: analysis.reasons,
                detectedAt: Date.now(),
                action: analysis.action
            });
            
            // Execute action based on configuration
            const accountAgeConfig = guildConfig.raidProtection.accountAge;
            if (accountAgeConfig?.enabled && analysis.action !== 'none') {
                
                switch (analysis.action) {
                    case 'ban':
                        if (member.bannable) {
                            await member.ban({ 
                                reason: `Raid protection: ${analysis.reason}`,
                                deleteMessageDays: 1 
                            });
                            logger.logModeration('BAN', user, analysis.reason, guild, guild.client.user);
                        }
                        break;
                        
                    case 'kick':
                        if (member.kickable) {
                            await member.kick(`Raid protection: ${analysis.reason}`);
                            logger.logModeration('KICK', user, analysis.reason, guild, guild.client.user);
                        }
                        break;
                        
                    case 'warn':
                        // Add warning to database if available
                        if (guild.client.userService) {
                            await guild.client.userService.addWarning(
                                guild.id,
                                user.id,
                                guild.client.user.id,
                                `Raid protection: ${analysis.reason}`,
                                { warningType: 'auto', severity: 2 }
                            );
                        }
                        logger.logModeration('WARN', user, analysis.reason, guild, guild.client.user);
                        break;
                }
                
                // Log moderation action to database
                if (guild.client.moderationService) {
                    await guild.client.moderationService.logAction(
                        guild.id,
                        user.id,
                        guild.client.user.id,
                        `AUTO_${analysis.action.toUpperCase()}`,
                        { 
                            reason: analysis.reason,
                            riskScore: analysis.riskScore,
                            autoDetected: true,
                            raidProtection: true
                        }
                    );
                }
            }
            
        } catch (error) {
            logger.error('Error handling suspicious user:', {
                error: error.message,
                userId: user.id,
                guildId: guild.id
            });
        }
    }
    
    /**
     * Activate server lockdown
     */
    async activateLockdown(guild, guildConfig) {
        try {
            const lockdownDuration = guildConfig.raidProtection.lockdownDuration || this.config.lockdownDuration;
            
            // Store lockdown status
            this.lockdownStatus.set(guild.id, {
                active: true,
                startTime: Date.now(),
                duration: lockdownDuration,
                originalPermissions: new Collection()
            });
            
            // Modify @everyone permissions to prevent new members from seeing channels
            const everyone = guild.roles.everyone;
            const lockdownData = this.lockdownStatus.get(guild.id);
            
            // Store original permissions
            lockdownData.originalPermissions.set(everyone.id, everyone.permissions.toArray());
            
            // Remove view channel permissions
            await everyone.setPermissions(
                everyone.permissions.remove(['ViewChannel', 'SendMessages']),
                'Raid protection lockdown'
            );
            
            logger.warn('Server lockdown activated', {
                guildId: guild.id,
                guildName: guild.name,
                duration: lockdownDuration
            });
            
            // Schedule lockdown removal
            setTimeout(async () => {
                await this.deactivateLockdown(guild);
            }, lockdownDuration);
            
        } catch (error) {
            logger.error('Error activating lockdown:', {
                error: error.message,
                guildId: guild.id
            });
        }
    }
    
    /**
     * Deactivate server lockdown
     */
    async deactivateLockdown(guild) {
        try {
            const lockdownData = this.lockdownStatus.get(guild.id);
            if (!lockdownData || !lockdownData.active) return;
            
            // Restore original permissions
            const everyone = guild.roles.everyone;
            const originalPermissions = lockdownData.originalPermissions.get(everyone.id);
            
            if (originalPermissions) {
                await everyone.setPermissions(
                    originalPermissions,
                    'Raid protection lockdown ended'
                );
            }
            
            // Remove lockdown status
            this.lockdownStatus.delete(guild.id);
            
            logger.info('Server lockdown deactivated', {
                guildId: guild.id,
                guildName: guild.name
            });
            
        } catch (error) {
            logger.error('Error deactivating lockdown:', {
                error: error.message,
                guildId: guild.id
            });
        }
    }
    
    /**
     * Kick recent suspicious joins
     */
    async kickRecentJoins(guild, guildData) {
        try {
            const now = Date.now();
            const recentJoins = guildData.joins.filter(join => 
                now - join.joinedAt < 60000 && // Last minute
                join.suspicious
            );
            
            let kickedCount = 0;
            
            for (const join of recentJoins) {
                try {
                    const member = await guild.members.fetch(join.userId);
                    if (member && member.kickable) {
                        await member.kick('Raid protection: Suspicious account during raid');
                        kickedCount++;
                        
                        // Log action
                        if (guild.client.moderationService) {
                            await guild.client.moderationService.logAction(
                                guild.id,
                                join.userId,
                                guild.client.user.id,
                                'AUTO_KICK',
                                { 
                                    reason: 'Raid protection: Suspicious account during raid',
                                    autoDetected: true,
                                    raidProtection: true
                                }
                            );
                        }
                    }
                } catch (memberError) {
                    logger.debug('Could not kick member during raid cleanup:', {
                        error: memberError.message,
                        userId: join.userId
                    });
                }
            }
            
            logger.info('Kicked suspicious members during raid', {
                guildId: guild.id,
                kickedCount,
                totalSuspicious: recentJoins.length
            });
            
        } catch (error) {
            logger.error('Error kicking recent joins:', {
                error: error.message,
                guildId: guild.id
            });
        }
    }
    
    /**
     * Notify moderators about raid
     */
    async notifyModerators(guild, raidCheck, guildConfig) {
        try {
            // Find moderation log channel
            const logChannelId = guildConfig.logging?.channels?.security || 
                                guildConfig.logging?.channels?.moderation;
            
            if (!logChannelId) return;
            
            const logChannel = guild.channels.cache.get(logChannelId);
            if (!logChannel) return;
            
            const embed = utils.createModerationEmbed(
                '🚨 RAID DETECTED',
                'Suspicious join activity detected - Raid protection activated',
                '#ff0000',
                [
                    { name: 'Recent Joins', value: raidCheck.recentJoins.toString(), inline: true },
                    { name: 'Risk Score', value: raidCheck.raidScore.toString(), inline: true },
                    { name: 'Time Window', value: utils.formatDuration(raidCheck.timeWindow), inline: true },
                    { name: 'Indicators', value: raidCheck.indicators.join('\n') || 'None', inline: false },
                    { name: 'Actions Taken', value: 'Automatic raid protection measures activated', inline: false }
                ]
            );
            
            await logChannel.send({ 
                content: '@here Raid detected!', 
                embeds: [embed] 
            });
            
        } catch (error) {
            logger.error('Error notifying moderators:', {
                error: error.message,
                guildId: guild.id
            });
        }
    }
    
    /**
     * Log join event
     */
    logJoinEvent(guildId, user, analysis, raidCheck) {
        logger.info('User join monitored', {
            guildId,
            userId: user.id,
            username: user.tag,
            riskScore: analysis.riskScore,
            suspicious: analysis.suspicious,
            action: analysis.action,
            raidDetected: raidCheck.isRaid,
            recentJoins: raidCheck.recentJoins
        });
    }
    
    /**
     * Get raid protection statistics
     */
    getStats() {
        const stats = {
            guildsMonitored: this.joinTracker.size,
            activeRaids: 0,
            activeLockdowns: this.lockdownStatus.size,
            suspiciousUsers: this.suspiciousUsers.size,
            totalJoinsTracked: 0
        };
        
        for (const guildData of this.joinTracker.values()) {
            if (guildData.raidActive) stats.activeRaids++;
            stats.totalJoinsTracked += guildData.joins.length;
        }
        
        return stats;
    }
    
    /**
     * Start cleanup interval
     */
    startCleanup() {
        setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
    }
    
    /**
     * Cleanup old data
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        // Cleanup join tracker
        for (const [guildId, guildData] of this.joinTracker.entries()) {
            guildData.joins = guildData.joins.filter(join => 
                now - join.joinedAt < maxAge
            );
            
            // Reset raid status if old
            if (guildData.raidActive && now - guildData.raidStarted > 60 * 60 * 1000) {
                guildData.raidActive = false;
            }
            
            // Remove empty guild data
            if (guildData.joins.length === 0 && !guildData.raidActive) {
                this.joinTracker.delete(guildId);
            }
        }
        
        // Cleanup suspicious users
        const suspiciousToDelete = [];
        for (const [userId, userData] of this.suspiciousUsers.entries()) {
            if (now - userData.detectedAt > maxAge) {
                suspiciousToDelete.push(userId);
            }
        }
        suspiciousToDelete.forEach(userId => this.suspiciousUsers.delete(userId));
        
        // Cleanup old raid events
        for (const [eventId, eventData] of this.raidEvents.entries()) {
            if (now - eventData.startTime > maxAge) {
                this.raidEvents.delete(eventId);
            }
        }
        
        logger.debug('Raid protection cleanup completed', {
            guildsTracked: this.joinTracker.size,
            suspiciousUsers: this.suspiciousUsers.size,
            raidEvents: this.raidEvents.size
        });
    }
}

module.exports = RaidProtection;
