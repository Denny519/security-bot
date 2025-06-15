require('dotenv').config();
const { Client, GatewayIntentBits, Events, Collection, ActivityType } = require('discord.js');
const config = require('./config.js');
const utils = require('./utils.js');
const { logger } = require('./logger.js');
const CommandHandler = require('./commands/index.js');
const SpamDetection = require('./modules/spamDetection.js');
const SecurityModule = require('./modules/security.js');
const ConfigManager = require('./modules/configManager.js');
const DatabaseManager = require('./modules/database.js');
const UserService = require('./services/userService.js');
const ModerationService = require('./services/moderationService.js');
const RaidProtection = require('./modules/raidProtection.js');
const ContentFilter = require('./modules/contentFilter.js');

// Create Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Cache for tracking user messages and violations
const userCache = new Collection();
const violationCache = new Collection();
const lastMessages = new Collection();
// Utility functions using external utils module
function getUserViolations(userId) {
    return violationCache.get(userId) || { count: 0, lastViolation: 0 };
}

function addViolation(userId) {
    const violations = getUserViolations(userId);
    violations.count++;
    violations.lastViolation = Date.now();
    violationCache.set(userId, violations);
    return violations;
}

function isUserOnCooldown(userId) {
    const user = userCache.get(userId);
    if (!user) return false;
    return Date.now() - user.lastMessage < config.spam.cooldown;
}



// Initialize database and services
client.database = new DatabaseManager({
    dbPath: './data/security-bot.db',
    backupPath: './data/backups'
});

// Initialize all modules
client.commandHandler = new CommandHandler(client);
client.spamDetection = new SpamDetection(config);
client.security = new SecurityModule(config);
client.configManager = new ConfigManager({
    defaultConfig: config,
    autoSave: true,
    saveInterval: 30000
});
client.raidProtection = new RaidProtection({
    joinThreshold: config.raidProtection.joinThreshold,
    timeWindow: config.raidProtection.timeWindow,
    accountAgeThreshold: config.raidProtection.accountAge.minimumAge
});
client.contentFilter = new ContentFilter({
    enabled: config.contentFilter?.enabled || true,
    strictMode: config.contentFilter?.strictMode || false,
    customWords: config.contentFilter?.customWords || [],
    allowedFileTypes: config.contentFilter?.allowedFileTypes || [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi',
        'pdf', 'txt', 'doc', 'docx', 'zip', 'rar'
    ]
});

// Initialize services (will be available after database is ready)
client.userService = null;
client.moderationService = null;

// Bot ready event
client.once(Events.ClientReady, async () => {
    try {
        logger.info(`Security Bot is online as ${client.user.tag}`, {
            botId: client.user.id,
            guildCount: client.guilds.cache.size,
            userCount: client.users.cache.size
        });

        // Initialize database
        logger.info('Initializing database...');
        await client.database.initialize();

        // Initialize services after database is ready
        client.userService = new UserService(client.database);
        client.moderationService = new ModerationService(client.database);

        logger.info('Database and services initialized successfully');

        // Set up Discord logging
        logger.setDiscordClient(client);

    // Configure Discord logging channels for each guild
    for (const guild of client.guilds.cache.values()) {
        const guildConfig = client.configManager.getGuildConfig(guild.id);
        if (guildConfig.logging?.discordLogging && guildConfig.logging?.channels) {
            logger.setDiscordChannels(guildConfig.logging.channels);
            logger.info('Discord logging configured for guild', {
                guildId: guild.id,
                guildName: guild.name,
                channels: guildConfig.logging.channels
            });
        }
    }

    client.user.setActivity('State Avenue Roleplay', {
        type: ActivityType.Watching
    });

    client.user.setStatus('online');
    logger.logSystem('bot_ready', {
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        version: '2.1.0'
    });

    // Log startup metrics
    const memoryUsage = process.memoryUsage();
    logger.logMetric('startup_memory', Math.round(memoryUsage.heapUsed / 1024 / 1024), 'MB', {
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
    });
    logger.logMetric('startup_guilds', client.guilds.cache.size);
    logger.logMetric('startup_users', client.users.cache.size);

    // Log configuration and database statistics
    const configStats = client.configManager.getStats();
    const dbStats = await client.database.getStats();

    logger.logSystem('systems_loaded', {
        config: configStats,
        database: dbStats,
        version: '2.2.0'
    });

    // Create initial database backup
    try {
        await client.database.createBackup();
        logger.info('Initial database backup created');
    } catch (backupError) {
        logger.warn('Failed to create initial backup:', { error: backupError.message });
    }

    } catch (error) {
        logger.error('Failed to initialize bot systems:', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
});

// Interaction handler - delegate to command handler
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.guild) {
        return interaction.reply({
            content: '❌ This command can only be used in servers.',
            ephemeral: true
        });
    }

    await client.commandHandler.handleInteraction(interaction);
});

// Message moderation with enhanced performance and memory management
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const userId = message.author.id;
    const content = message.content;
    const guild = message.guild;
    const now = Date.now();

    try {
        // Get guild-specific configuration
        const guildConfig = client.configManager.getGuildConfig(guild.id);

        // Check if user is on cooldown
        if (isUserOnCooldown(userId)) {
            await message.delete().catch(() => {});
            return;
        }

        let shouldModerate = false;
        let moderationAction = 'warn';
        let reason = '';

        // Advanced spam detection using the spam detection module
        if (guildConfig.spam.enabled) {
            const spamAnalysis = client.spamDetection.analyzeMessage(message);

            if (spamAnalysis.isSpam) {
                shouldModerate = true;
                moderationAction = spamAnalysis.action;
                reason = `Spam detected: ${spamAnalysis.reasons.join(', ')} (${spamAnalysis.confidence}% confidence)`;

                // Add violation to spam detection system
                client.spamDetection.addViolation(userId, reason, spamAnalysis.severity);

                logger.info('Spam detected by advanced analysis', {
                    userId,
                    userTag: message.author.tag,
                    guildId: guild.id,
                    confidence: spamAnalysis.confidence,
                    severity: spamAnalysis.severity,
                    reasons: spamAnalysis.reasons,
                    action: spamAnalysis.action
                });
            }

            // Store message with timestamp for analysis (fallback)
            lastMessages.set(userId, { content, timestamp: now });
        }

        // Enhanced link detection
        if (guildConfig.links.enabled && (content.includes('http://') || content.includes('https://'))) {
            const urls = utils.extractUrls(content);

            for (const url of urls) {
                if (!utils.isWhitelistedLink(url, guildConfig.links.whitelist)) {
                    // Check for URL shorteners
                    if (utils.isUrlShortener(url)) {
                        shouldModerate = true;
                        moderationAction = 'kick';
                        reason = 'Unauthorized URL shortener detected';
                        break;
                    } else {
                        shouldModerate = true;
                        moderationAction = 'warn';
                        reason = 'Unauthorized link sharing';
                    }
                }
            }
        }

        // Enhanced mention detection
        if (guildConfig.mentions.enabled && message.mentions.users.size > 0) {
            const mentionCount = guildConfig.mentions.excludeBotMentions
                ? message.mentions.users.filter(user => !user.bot).size
                : message.mentions.users.size;

            if (mentionCount > guildConfig.mentions.maxMentions) {
                shouldModerate = true;
                moderationAction = mentionCount > guildConfig.mentions.maxMentions * 2 ? 'kick' : 'warn';
                reason = `Excessive mentions (${mentionCount} mentions)`;
            }
        }

        // Security threat analysis
        const securityAnalysis = client.security.analyzeMessage(message);
        if (securityAnalysis.threatLevel !== 'none') {
            shouldModerate = true;

            // Determine action based on threat level
            switch (securityAnalysis.threatLevel) {
                case 'critical':
                    moderationAction = 'ban';
                    break;
                case 'high':
                    moderationAction = 'kick';
                    break;
                case 'medium':
                    moderationAction = 'timeout';
                    break;
                case 'low':
                    moderationAction = 'warn';
                    break;
            }

            reason = `Security threat detected: ${securityAnalysis.threats.join(', ')}`;

            logger.warn('Security threat detected in message', {
                userId,
                userTag: message.author.tag,
                guildId: guild.id,
                threatLevel: securityAnalysis.threatLevel,
                threatScore: securityAnalysis.threatScore,
                threats: securityAnalysis.threats
            });
        }

        // Content filtering analysis
        const contentAnalysis = client.contentFilter.analyzeContent(message);
        if (contentAnalysis.filtered) {
            shouldModerate = true;

            // Determine action based on content severity
            if (contentAnalysis.action !== 'none' &&
                (moderationAction === 'none' || contentAnalysis.severity > 2)) {
                moderationAction = contentAnalysis.action;
                reason = `Content filtered: ${contentAnalysis.detections.map(d => d.type).join(', ')}`;
            }

            logger.warn('Content filtered in message', {
                userId,
                userTag: message.author.tag,
                guildId: guild.id,
                severity: contentAnalysis.severity,
                detections: contentAnalysis.detections,
                action: contentAnalysis.action,
                language: contentAnalysis.language
            });

            // Log to database if available
            if (client.userService) {
                await client.userService.addViolation(
                    guild.id,
                    userId,
                    'content_filter',
                    {
                        severity: contentAnalysis.severity,
                        autoDetected: true,
                        messageContent: message.content.substring(0, 500), // Truncate for storage
                        metadata: {
                            detections: contentAnalysis.detections,
                            language: contentAnalysis.language,
                            confidence: contentAnalysis.confidence
                        }
                    }
                );
            }
        }

        // Execute moderation action with progressive punishment
        if (shouldModerate) {
            await message.delete().catch(() => {});

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return;

            const violations = addViolation(userId);

            // Determine action based on violation count and severity
            let finalAction = moderationAction;
            if (violations.count >= 3) {
                finalAction = 'kick';
            } else if (violations.count >= 2 && moderationAction !== 'kick') {
                finalAction = 'timeout';
            }

            // Execute the moderation action
            switch (finalAction) {
                case 'warn':
                    await message.channel.send(`⚠️ ${message.author}, ${reason}. This is warning ${violations.count}.`);
                    userCache.set(userId, { lastMessage: now });
                    logger.logModeration('WARN', message.author, reason, guild);
                    break;

                case 'timeout':
                    if (member.moderatable) {
                        const timeoutDuration = Math.min(violations.count * 300000, 2419200000); // Max 28 days
                        await member.timeout(timeoutDuration, `Auto-moderation: ${reason}`);
                        await message.channel.send(`⏰ ${message.author.tag} has been timed out for ${utils.formatDuration(timeoutDuration)}: ${reason}`);
                        logger.logModeration('TIMEOUT', message.author, reason, guild);
                    }
                    break;

                case 'kick':
                    if (member.kickable) {
                        await member.kick(`${guildConfig.moderation.kickReason}: ${reason}`);
                        await message.channel.send(`🔨 ${message.author.tag} has been kicked for: ${reason}`);
                        logger.logModeration('KICK', message.author, reason, guild);

                        // Log to database if available
                        if (client.moderationService) {
                            await client.moderationService.logAction(
                                guild.id,
                                message.author.id,
                                client.user.id,
                                'AUTO_KICK',
                                { reason, autoDetected: true }
                            );
                        }
                    }
                    break;
            }
        }
    } catch (error) {
        logger.error('Error in message moderation:', {
            error: error.message,
            stack: error.stack,
            userId,
            guildId: guild.id,
            messageId: message.id
        });
    }
});

// Error handling
client.on(Events.Error, (error) => {
    logger.error('Discord client error:', { error: error.message, stack: error.stack });
});

client.on(Events.Warn, (warning) => {
    logger.warn('Discord client warning:', { warning });
});

// Guild join/leave logging
client.on(Events.GuildCreate, (guild) => {
    logger.info('Bot added to new guild', {
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount
    });
});

client.on(Events.GuildDelete, (guild) => {
    logger.info('Bot removed from guild', {
        guildId: guild.id,
        guildName: guild.name
    });
});

// Member join event with security analysis and raid detection
client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const guild = member.guild;

        // Perform security analysis on new member
        const userAnalysis = client.security.analyzeUser(member.user, guild);

        // Log high-risk users
        if (userAnalysis.riskLevel === 'high' || userAnalysis.riskLevel === 'critical') {
            logger.warn('High-risk user joined server', {
                userId: member.id,
                userTag: member.user.tag,
                guildId: guild.id,
                guildName: guild.name,
                riskLevel: userAnalysis.riskLevel,
                riskScore: userAnalysis.riskScore,
                flags: userAnalysis.flags
            });
        }

        // Get guild-specific configuration
        const guildConfig = client.configManager.getGuildConfig(guild.id);

        // Perform raid detection
        if (guildConfig.raidProtection.enabled) {
            const raidAnalysis = client.security.detectRaid(guild, member);

            if (raidAnalysis.isRaid) {
                logger.logSecurity('raid_detected', {
                    guildId: guild.id,
                    guildName: guild.name,
                    joinCount: raidAnalysis.joinCount,
                    suspiciousCount: raidAnalysis.suspiciousCount,
                    confidence: raidAnalysis.confidence,
                    recommendations: raidAnalysis.recommendations,
                    severity: 'high'
                });

                // Auto-kick very suspicious accounts during raids
                if (userAnalysis.riskScore >= 70 && guildConfig.raidProtection.actions?.kickNewMembers) {
                    try {
                        await member.kick('Auto-kick during raid: High-risk account');
                        logger.logModeration('AUTO_KICK', member.user, 'High-risk account during raid', guild);
                    } catch (kickError) {
                        logger.error('Failed to auto-kick suspicious user:', { error: kickError.message });
                    }
                }
            }
        }

        // Account age verification
        if (guildConfig.raidProtection.accountAge.enabled) {
            const accountAge = Date.now() - member.user.createdTimestamp;

            if (accountAge < guildConfig.raidProtection.accountAge.minimumAge) {
                const action = guildConfig.raidProtection.accountAge.action;
                const ageHours = Math.round(accountAge / (1000 * 60 * 60));

                logger.logSecurity('account_age_violation', {
                    userId: member.id,
                    userTag: member.user.tag,
                    accountAgeHours: ageHours,
                    minimumAgeHours: Math.round(guildConfig.raidProtection.accountAge.minimumAge / (1000 * 60 * 60)),
                    action,
                    guildId: guild.id,
                    severity: 'medium'
                });

                if (action === 'kick' && member.kickable) {
                    await member.kick(`Account too new (${ageHours}h old, minimum: ${Math.round(guildConfig.raidProtection.accountAge.minimumAge / (1000 * 60 * 60))}h)`);
                    logger.logModeration('AUTO_KICK', member.user, `Account age violation (${ageHours}h old)`, guild);
                } else if (action === 'ban' && member.bannable) {
                    await member.ban({ reason: `Account too new (${ageHours}h old)` });
                    logger.logModeration('AUTO_BAN', member.user, `Account age violation (${ageHours}h old)`, guild);
                }
            }
        }

    } catch (error) {
        logger.error('Error in member join handler:', {
            error: error.message,
            stack: error.stack,
            userId: member.id,
            guildId: member.guild.id
        });
    }
});

// Member leave event logging
client.on(Events.GuildMemberRemove, (member) => {
    logger.debug('Member left server', {
        userId: member.id,
        userTag: member.user.tag,
        guildId: member.guild.id,
        guildName: member.guild.name
    });
});

// Enhanced cache management with memory optimization
function performCacheCleanup() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const fiveMinutes = 5 * 60 * 1000;

    let totalCleaned = 0;

    // Clean old violations (keep for 1 hour)
    const violationsBefore = violationCache.size;
    violationCache.sweep(violation => {
        const shouldRemove = now - violation.lastViolation > oneHour;
        if (shouldRemove) totalCleaned++;
        return !shouldRemove;
    });
    const violationsRemoved = violationsBefore - violationCache.size;

    // Clean old user cache (keep for 1 hour)
    const usersBefore = userCache.size;
    userCache.sweep(user => {
        const shouldRemove = now - (user.lastMessage || user.firstMessage || 0) > oneHour;
        if (shouldRemove) totalCleaned++;
        return !shouldRemove;
    });
    const usersRemoved = usersBefore - userCache.size;

    // Clean old messages (keep for 5 minutes for spam detection)
    const messagesBefore = lastMessages.size;
    lastMessages.sweep(messageData => {
        const shouldRemove = now - messageData.timestamp > fiveMinutes;
        if (shouldRemove) totalCleaned++;
        return !shouldRemove;
    });
    const messagesRemoved = messagesBefore - lastMessages.size;

    // Clean command handler caches
    if (client.commandHandler) {
        client.commandHandler.cleanup();
    }

    // Clean spam detection caches
    if (client.spamDetection) {
        client.spamDetection.cleanup();
    }

    // Clean security module caches
    if (client.security) {
        client.security.cleanup();
    }

    // Force garbage collection if available and memory usage is high
    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    if (global.gc && memoryMB > 100) {
        global.gc();
        logger.debug('Forced garbage collection due to high memory usage', { memoryMB });
    }

    logger.debug('Cache cleanup completed', {
        violationsRemoved,
        usersRemoved,
        messagesRemoved,
        totalCleaned,
        memoryUsage: memoryMB + 'MB',
        cacheStats: {
            violations: violationCache.size,
            users: userCache.size,
            messages: lastMessages.size
        }
    });

    // Log warning if caches are growing too large
    if (violationCache.size > 1000 || userCache.size > 1000 || lastMessages.size > 500) {
        logger.warn('Cache sizes are growing large', {
            violations: violationCache.size,
            users: userCache.size,
            messages: lastMessages.size
        });
    }
}

// Run cleanup every 5 minutes
setInterval(performCacheCleanup, 5 * 60 * 1000);

// Run initial cleanup after 1 minute
setTimeout(performCacheCleanup, 60 * 1000);

// Graceful shutdown handling
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Member join event - Raid Protection
client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const guildConfig = client.configManager.getGuildConfig(member.guild.id);

        // Monitor join with raid protection
        if (client.raidProtection && guildConfig.raidProtection?.enabled) {
            const result = await client.raidProtection.monitorJoin(member, guildConfig);

            logger.info('Member join monitored', {
                guildId: member.guild.id,
                userId: member.user.id,
                username: member.user.tag,
                action: result.action,
                suspicious: result.suspicious,
                raidDetected: result.raidDetected,
                riskScore: result.riskScore
            });
        }

        // Log join event
        logger.logSystem('member_join', {
            guildId: member.guild.id,
            guildName: member.guild.name,
            userId: member.user.id,
            username: member.user.tag,
            accountAge: Date.now() - member.user.createdAt.getTime()
        });

    } catch (error) {
        logger.error('Error handling member join:', {
            error: error.message,
            guildId: member.guild.id,
            userId: member.user.id
        });
    }
});

// Member leave event
client.on(Events.GuildMemberRemove, async (member) => {
    try {
        logger.logSystem('member_leave', {
            guildId: member.guild.id,
            guildName: member.guild.name,
            userId: member.user.id,
            username: member.user.tag
        });
    } catch (error) {
        logger.error('Error handling member leave:', {
            error: error.message,
            guildId: member.guild.id,
            userId: member.user.id
        });
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString()
    });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

// Login with error handling
async function startBot() {
    try {
        if (!process.env.DISCORD_TOKEN) {
            throw new Error('DISCORD_TOKEN environment variable is required');
        }

        logger.info('Starting Security Bot...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        logger.error('Failed to start bot:', { error: error.message });
        process.exit(1);
    }
}

startBot();
