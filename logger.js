const fs = require('fs');
const path = require('path');

/**
 * Sanitize text for logging (remove sensitive information)
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
    if (typeof text !== 'string') return String(text);

    // Remove potential tokens, passwords, etc.
    return text
        .replace(/[A-Za-z0-9]{24}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27}/g, '[TOKEN_REMOVED]')
        .replace(/password[:\s]*[^\s]+/gi, 'password: [REDACTED]')
        .replace(/token[:\s]*[^\s]+/gi, 'token: [REDACTED]')
        .replace(/key[:\s]*[^\s]+/gi, 'key: [REDACTED]');
}

/**
 * Advanced logging system for the Security Bot
 */
class Logger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
        this.logFile = options.logFile || process.env.LOG_FILE || './logs/security-bot.log';
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.maxFiles = options.maxFiles || 5;
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile !== false;
        this.enableDiscord = options.enableDiscord || false;

        // Discord logging configuration
        this.discordClient = options.discordClient || null;
        this.discordChannels = {
            general: options.generalLogChannel || null,
            moderation: options.moderationLogChannel || null,
            security: options.securityLogChannel || null,
            errors: options.errorLogChannel || null
        };

        // Log levels
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };

        // Performance metrics tracking
        this.metrics = {
            totalLogs: 0,
            errorCount: 0,
            warnCount: 0,
            lastLogTime: null,
            logRates: {
                perMinute: 0,
                perHour: 0
            }
        };

        // Log buffer for batch processing
        this.logBuffer = [];
        this.bufferSize = options.bufferSize || 100;
        this.flushInterval = options.flushInterval || 5000; // 5 seconds

        // Ensure log directory exists
        this.ensureLogDirectory();

        // Start buffer flushing
        this.startBufferFlushing();
    }
    
    /**
     * Ensure the log directory exists
     */
    ensureLogDirectory() {
        if (this.enableFile) {
            const logDir = path.dirname(this.logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }
    
    /**
     * Check if a log level should be logged
     * @param {string} level - Log level to check
     * @returns {boolean} - Whether to log this level
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }
    
    /**
     * Format log message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} meta - Additional metadata
     * @returns {string} - Formatted log message
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const sanitizedMessage = sanitizeText(message);

        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message: sanitizedMessage,
            ...meta
        };

        return JSON.stringify(logEntry);
    }
    
    /**
     * Write log to file
     * @param {string} formattedMessage - Formatted log message
     */
    writeToFile(formattedMessage) {
        if (!this.enableFile) return;
        
        try {
            // Check file size and rotate if necessary
            if (fs.existsSync(this.logFile)) {
                const stats = fs.statSync(this.logFile);
                if (stats.size > this.maxFileSize) {
                    this.rotateLogFile();
                }
            }
            
            fs.appendFileSync(this.logFile, formattedMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    
    /**
     * Rotate log files
     */
    rotateLogFile() {
        try {
            const logDir = path.dirname(this.logFile);
            const logName = path.basename(this.logFile, path.extname(this.logFile));
            const logExt = path.extname(this.logFile);
            
            // Shift existing log files
            for (let i = this.maxFiles - 1; i > 0; i--) {
                const oldFile = path.join(logDir, `${logName}.${i}${logExt}`);
                const newFile = path.join(logDir, `${logName}.${i + 1}${logExt}`);
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // Delete oldest file
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }
            
            // Move current log to .1
            const firstRotated = path.join(logDir, `${logName}.1${logExt}`);
            if (fs.existsSync(this.logFile)) {
                fs.renameSync(this.logFile, firstRotated);
            }
        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }
    
    /**
     * Write log to console
     * @param {string} level - Log level
     * @param {string} message - Log message
     */
    writeToConsole(level, message) {
        if (!this.enableConsole) return;
        
        const timestamp = new Date().toISOString();
        const coloredLevel = this.colorizeLevel(level);
        const formattedMessage = `[${timestamp}] ${coloredLevel}: ${message}`;
        
        switch (level) {
            case 'error':
                console.error(formattedMessage);
                break;
            case 'warn':
                console.warn(formattedMessage);
                break;
            default:
                console.log(formattedMessage);
        }
    }
    
    /**
     * Add color to log level for console output
     * @param {string} level - Log level
     * @returns {string} - Colorized level
     */
    colorizeLevel(level) {
        const colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[35m', // Magenta
            trace: '\x1b[37m'  // White
        };
        
        const reset = '\x1b[0m';
        const color = colors[level] || colors.info;
        
        return `${color}${level.toUpperCase()}${reset}`;
    }
    
    /**
     * Generic log method
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} meta - Additional metadata
     */
    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;
        
        const formattedMessage = this.formatMessage(level, message, meta);
        
        this.writeToConsole(level, message);
        this.writeToFile(formattedMessage);
    }
    
    /**
     * Log error message
     * @param {string} message - Error message
     * @param {Object} meta - Additional metadata
     */
    error(message, meta = {}) {
        this.log('error', message, meta);
    }
    
    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {Object} meta - Additional metadata
     */
    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }
    
    /**
     * Log info message
     * @param {string} message - Info message
     * @param {Object} meta - Additional metadata
     */
    info(message, meta = {}) {
        this.log('info', message, meta);
    }
    
    /**
     * Log debug message
     * @param {string} message - Debug message
     * @param {Object} meta - Additional metadata
     */
    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }
    
    /**
     * Log trace message
     * @param {string} message - Trace message
     * @param {Object} meta - Additional metadata
     */
    trace(message, meta = {}) {
        this.log('trace', message, meta);
    }
    
    /**
     * Log moderation action with Discord integration
     * @param {string} action - Action performed
     * @param {Object} user - Target user
     * @param {string} reason - Reason for action
     * @param {Object} guild - Guild where action occurred
     * @param {Object} moderator - Moderator who performed action
     */
    logModeration(action, user, reason, guild, moderator = null) {
        const meta = {
            action,
            userId: user.id,
            userTag: user.tag,
            guildId: guild.id,
            guildName: guild.name,
            moderatorId: moderator?.id,
            moderatorTag: moderator?.tag,
            reason,
            category: 'moderation'
        };

        // Use async logging for moderation actions (important for Discord logging)
        this.logAsync('info', `Moderation action: ${action} on ${user.tag} in ${guild.name}`, meta);
    }

    /**
     * Log security event with enhanced tracking
     * @param {string} event - Security event type
     * @param {Object} details - Event details
     */
    logSecurity(event, details = {}) {
        const meta = {
            securityEvent: event,
            category: 'security',
            severity: details.severity || 'medium',
            ...details
        };

        // Use async logging for security events (important for Discord alerts)
        this.logAsync('warn', `Security event: ${event}`, meta);
    }

    /**
     * Log performance metrics with trend analysis
     * @param {string} metric - Metric name
     * @param {number} value - Metric value
     * @param {string} unit - Metric unit
     * @param {Object} context - Additional context
     */
    logMetric(metric, value, unit = '', context = {}) {
        const meta = {
            metric,
            value,
            unit,
            category: 'performance',
            ...context
        };

        this.debug(`Performance metric: ${metric} = ${value}${unit}`, meta);
    }

    /**
     * Log system event with categorization
     * @param {string} event - Event type
     * @param {Object} details - Event details
     */
    logSystem(event, details = {}) {
        const meta = {
            systemEvent: event,
            category: 'system',
            ...details
        };

        this.info(`System event: ${event}`, meta);
    }

    /**
     * Log user activity for analytics
     * @param {string} activity - Activity type
     * @param {Object} user - User object
     * @param {Object} context - Activity context
     */
    logActivity(activity, user, context = {}) {
        const meta = {
            activity,
            userId: user.id,
            userTag: user.tag,
            category: 'activity',
            ...context
        };

        this.debug(`User activity: ${activity} by ${user.tag}`, meta);
    }
    
    /**
     * Log performance metrics
     * @param {string} metric - Metric name
     * @param {number} value - Metric value
     * @param {string} unit - Metric unit
     */
    logMetric(metric, value, unit = '') {
        const meta = {
            metric,
            value,
            unit
        };
        
        this.debug(`Performance metric: ${metric} = ${value}${unit}`, meta);
    }
    
    /**
     * Start buffer flushing interval
     */
    startBufferFlushing() {
        setInterval(() => {
            this.flushBuffer();
        }, this.flushInterval);
    }

    /**
     * Add log to buffer for batch processing
     */
    addToBuffer(level, message, meta) {
        this.logBuffer.push({
            level,
            message,
            meta,
            timestamp: Date.now()
        });

        // Flush if buffer is full
        if (this.logBuffer.length >= this.bufferSize) {
            this.flushBuffer();
        }
    }

    /**
     * Flush log buffer to file
     */
    flushBuffer() {
        if (this.logBuffer.length === 0) return;

        try {
            const logs = this.logBuffer.splice(0); // Clear buffer
            const logEntries = logs.map(log =>
                this.formatMessage(log.level, log.message, log.meta)
            ).join('\n') + '\n';

            if (this.enableFile) {
                fs.appendFileSync(this.logFile, logEntries);
            }

        } catch (error) {
            console.error('Failed to flush log buffer:', error);
        }
    }

    /**
     * Write to Discord channel
     */
    async writeToDiscord(level, message, meta = {}) {
        if (!this.enableDiscord || !this.discordClient) return;

        try {
            // Determine which channel to use
            let channelId = this.discordChannels.general;

            if (level === 'error') {
                channelId = this.discordChannels.errors || channelId;
            } else if (meta.securityEvent) {
                channelId = this.discordChannels.security || channelId;
            } else if (meta.action) {
                channelId = this.discordChannels.moderation || channelId;
            }

            if (!channelId) return;

            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) return;

            // Create embed for Discord
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle(`${level.toUpperCase()} Log`)
                .setDescription(message)
                .setTimestamp()
                .setColor(this.getLevelColor(level));

            // Add metadata fields
            if (Object.keys(meta).length > 0) {
                const fields = Object.entries(meta)
                    .slice(0, 10) // Discord embed field limit
                    .map(([key, value]) => ({
                        name: key,
                        value: String(value).substring(0, 1024), // Discord field value limit
                        inline: true
                    }));

                embed.addFields(fields);
            }

            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Failed to write to Discord:', error);
        }
    }

    /**
     * Get color for log level
     */
    getLevelColor(level) {
        const colors = {
            error: 0xff0000,   // Red
            warn: 0xffa500,    // Orange
            info: 0x00ff00,    // Green
            debug: 0x0099ff,   // Blue
            trace: 0x999999    // Gray
        };

        return colors[level] || colors.info;
    }

    /**
     * Update performance metrics
     */
    updateMetrics(level) {
        this.metrics.totalLogs++;
        this.metrics.lastLogTime = Date.now();

        if (level === 'error') {
            this.metrics.errorCount++;
        } else if (level === 'warn') {
            this.metrics.warnCount++;
        }

        // Calculate log rates (simplified)
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneHourAgo = now - 3600000;

        // This is a simplified rate calculation
        // In production, you'd want a more sophisticated sliding window
        this.metrics.logRates.perMinute = Math.min(this.metrics.totalLogs, 60);
        this.metrics.logRates.perHour = Math.min(this.metrics.totalLogs, 3600);
    }

    /**
     * Enhanced log method with Discord integration
     */
    async logAsync(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;

        // Update metrics
        this.updateMetrics(level);

        // Console output (immediate)
        this.writeToConsole(level, message);

        // File output (buffered for performance)
        if (this.enableFile) {
            this.addToBuffer(level, message, meta);
        }

        // Discord output (async)
        if (this.enableDiscord && (level === 'error' || level === 'warn' || meta.securityEvent || meta.action)) {
            await this.writeToDiscord(level, message, meta);
        }
    }

    /**
     * Set Discord client for logging
     */
    setDiscordClient(client) {
        this.discordClient = client;
    }

    /**
     * Set Discord log channels
     */
    setDiscordChannels(channels) {
        this.discordChannels = { ...this.discordChannels, ...channels };
        this.enableDiscord = true;
    }

    /**
     * Get enhanced log statistics
     * @returns {Object} - Log statistics
     */
    getStats() {
        const stats = {
            logLevel: this.logLevel,
            logFile: this.logFile,
            fileLogging: this.enableFile,
            consoleLogging: this.enableConsole,
            discordLogging: this.enableDiscord,
            metrics: { ...this.metrics },
            bufferSize: this.logBuffer.length,
            maxBufferSize: this.bufferSize
        };

        if (this.enableFile && fs.existsSync(this.logFile)) {
            const fileStats = fs.statSync(this.logFile);
            stats.fileSize = fileStats.size;
            stats.fileSizeMB = Math.round(fileStats.size / 1024 / 1024 * 100) / 100;
            stats.lastModified = fileStats.mtime;
        }

        // Calculate log directory size
        try {
            const logDir = path.dirname(this.logFile);
            const files = fs.readdirSync(logDir);
            const logFiles = files.filter(file => file.includes('security-bot'));

            let totalSize = 0;
            for (const file of logFiles) {
                const filePath = path.join(logDir, file);
                const fileStats = fs.statSync(filePath);
                totalSize += fileStats.size;
            }

            stats.totalLogSize = totalSize;
            stats.totalLogSizeMB = Math.round(totalSize / 1024 / 1024 * 100) / 100;
            stats.logFileCount = logFiles.length;

        } catch (error) {
            stats.totalLogSize = 0;
            stats.logFileCount = 0;
        }

        return stats;
    }

    /**
     * Analyze log patterns and generate insights
     */
    analyzeLogPatterns() {
        const stats = this.getStats();
        const analysis = {
            healthScore: 100,
            issues: [],
            recommendations: []
        };

        // Check error rate
        const errorRate = stats.metrics.errorCount / Math.max(stats.metrics.totalLogs, 1);
        if (errorRate > 0.1) { // More than 10% errors
            analysis.healthScore -= 30;
            analysis.issues.push('High error rate detected');
            analysis.recommendations.push('Investigate recurring errors');
        }

        // Check log file size
        if (stats.fileSizeMB > 50) {
            analysis.healthScore -= 10;
            analysis.issues.push('Large log file size');
            analysis.recommendations.push('Consider reducing log level or increasing rotation frequency');
        }

        // Check buffer usage
        const bufferUsage = stats.bufferSize / stats.maxBufferSize;
        if (bufferUsage > 0.8) {
            analysis.healthScore -= 15;
            analysis.issues.push('High log buffer usage');
            analysis.recommendations.push('Increase buffer size or flush interval');
        }

        // Check total log directory size
        if (stats.totalLogSizeMB > 100) {
            analysis.healthScore -= 10;
            analysis.issues.push('Large total log directory size');
            analysis.recommendations.push('Clean up old log files');
        }

        return analysis;
    }

    /**
     * Clean up old logs based on age and size
     */
    cleanupLogs(maxAge = 7 * 24 * 60 * 60 * 1000, maxTotalSize = 100 * 1024 * 1024) {
        try {
            const logDir = path.dirname(this.logFile);
            const files = fs.readdirSync(logDir);
            const logFiles = files
                .filter(file => file.includes('security-bot') && file !== path.basename(this.logFile))
                .map(file => ({
                    name: file,
                    path: path.join(logDir, file),
                    stats: fs.statSync(path.join(logDir, file))
                }))
                .sort((a, b) => a.stats.mtime - b.stats.mtime); // Oldest first

            const now = Date.now();
            let totalSize = logFiles.reduce((sum, file) => sum + file.stats.size, 0);
            let deletedCount = 0;
            let deletedSize = 0;

            for (const file of logFiles) {
                const age = now - file.stats.mtime;
                const shouldDeleteByAge = age > maxAge;
                const shouldDeleteBySize = totalSize > maxTotalSize;

                if (shouldDeleteByAge || shouldDeleteBySize) {
                    fs.unlinkSync(file.path);
                    totalSize -= file.stats.size;
                    deletedSize += file.stats.size;
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                this.info('Log cleanup completed', {
                    deletedFiles: deletedCount,
                    deletedSizeMB: Math.round(deletedSize / 1024 / 1024 * 100) / 100,
                    remainingFiles: logFiles.length - deletedCount,
                    remainingSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
                });
            }

            return {
                deletedFiles: deletedCount,
                deletedSize,
                remainingFiles: logFiles.length - deletedCount,
                remainingSize: totalSize
            };

        } catch (error) {
            this.error('Failed to cleanup logs', { error: error.message });
            return null;
        }
    }
}

// Create default logger instance
const logger = new Logger();

module.exports = {
    Logger,
    logger
};
