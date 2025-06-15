module.exports = {
    // Bot configuration
    bot: {
        name: 'Security Bot',
        version: '2.2.0',
        description: 'Advanced Discord Security and Moderation Bot',
        author: 'Security Bot Team',
        prefix: '!', // Fallback prefix for text commands
    },

    // Moderation settings
    moderation: {
        // General settings
        logChannel: null, // Set to channel ID for logging
        kickReason: 'Automated moderation action',
        banReason: 'Automated moderation action',
        warnBeforeKick: true,
        maxWarnings: 3,
        autoModeration: true, // Added for schema compatibility

        // Auto-moderation settings
        autoMod: {
            enabled: true,
            deleteMessages: true,
            notifyChannel: true,
            notifyUser: true,
        },

        // Punishment escalation
        escalation: {
            enabled: true,
            steps: [
                { action: 'warn', threshold: 1 },
                { action: 'timeout', threshold: 2, duration: 300000 }, // 5 minutes
                { action: 'timeout', threshold: 3, duration: 3600000 }, // 1 hour
                { action: 'kick', threshold: 4 },
                { action: 'ban', threshold: 5 }
            ]
        }
    },

    // Content filtering settings
    contentFilter: {
        enabled: true,
        strictMode: false, // If true, stops at first detection

        // Custom words to filter (in addition to built-in profanity)
        customWords: [
            // Add your custom words here
            // 'example', 'badword'
        ],

        // Whitelisted users (user IDs or tags)
        whitelist: [
            // Add trusted user IDs here
            // '123456789012345678'
        ],

        // File filtering settings
        allowedFileTypes: [
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
            'mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'ogg',
            'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'zip', 'rar', '7z', 'tar', 'gz'
        ],

        maxFileSize: 50 * 1024 * 1024, // 50MB in bytes

        // Language-specific settings
        languages: {
            english: true,
            spanish: true,
            french: true,
            german: true,
            portuguese: true
        },

        // Actions for different severity levels
        actions: {
            mild: 'warn',      // Level 1: damn, hell, crap
            moderate: 'delete', // Level 2: shit, ass, bitch
            strong: 'timeout',  // Level 3: fuck, cock, pussy
            extreme: 'ban'      // Level 4: hate speech, slurs
        }
    },

    // Spam detection configuration
    spam: {
        enabled: true,
        maxDuplicateMessages: 1,
        timeWindow: 60000, // 5 seconds
        cooldown: 10000, // 10 seconds before user can send again
        maxMessagesPerMinute: 10,
        
        // Advanced spam detection
        advanced: {
            enabled: true,
            similarityThreshold: 0.8, // 80% similarity
            checkEmojis: true,
            checkRepeatedChars: true,
            maxRepeatedChars: 5
        }
    },

    // Link detection configuration
    links: {
        enabled: true,
        allowWhitelist: true,
        whitelist: [
            'discord.gg',
            'discord.com',
            'github.com',
            'youtube.com',
            'youtu.be',
            'tenor.com',
            'giphy.com',
            'imgur.com',
            'reddit.com',
            'twitter.com',
            'x.com',
            'twitch.tv'
        ],
        
        // Advanced link checking
        advanced: {
            enabled: true,
            checkShorteners: true,
            checkSuspiciousDomains: true,
            checkIPAddresses: true,
            allowedFileTypes: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']
        }
    },

    // Mention detection configuration
    mentions: {
        enabled: true,
        maxMentions: 3,
        excludeBotMentions: true,
        excludeRoleMentions: false,
        maxRoleMentions: 1,
        
        // Ghost ping detection
        ghostPing: {
            enabled: true,
            trackDuration: 30000 // 30 seconds
        }
    },



    // Raid protection configuration
    raidProtection: {
        enabled: true,
        joinThreshold: 5, // Users joining within timeWindow
        timeWindow: 60000, // 1 minute (60 seconds)

        actions: {
            lockdown: true,
            kickNewMembers: true,
            requireVerification: true,
            notifyModerators: true
        },

        // Account age requirements
        accountAge: {
            enabled: true,
            minimumAge: 604800000, // 7 days in milliseconds (corrected)
            action: 'kick' // kick, ban, or warn
        }
    },

    // Image/attachment moderation
    attachments: {
        enabled: true,
        maxSize: 8388608, // 8MB in bytes
        allowedTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/webm',
            'text/plain'
        ],
        
        // NSFW detection (requires external API)
        nsfwDetection: {
            enabled: false,
            apiKey: null,
            threshold: 0.7
        }
    },

    // Logging configuration
    logging: {
        enabled: true,
        channels: {
            moderation: null, // Channel ID for moderation logs
            joins: null, // Channel ID for join/leave logs
            messages: null, // Channel ID for message logs
            voice: null, // Channel ID for voice logs
            errors: null // Channel ID for error logs
        },
        
        // What to log
        events: {
            messageDelete: true,
            messageEdit: true,
            memberJoin: true,
            memberLeave: true,
            memberBan: true,
            memberUnban: true,
            memberKick: true,
            memberTimeout: true,
            roleCreate: true,
            roleDelete: true,
            roleUpdate: true,
            channelCreate: true,
            channelDelete: true,
            channelUpdate: true,
            voiceStateUpdate: true
        }
    },

    // Performance settings
    performance: {
        cacheCleanupInterval: 300000, // 5 minutes
        maxCacheSize: 1000,
        rateLimitBuffer: 100, // milliseconds
        
        // Database settings (if using database)
        database: {
            enabled: true,
            type: 'sqlite', // sqlite, mysql, postgresql
            path: './data/security-bot.db',
            host: null,
            port: null,
            username: null,
            password: null,
            database: null
        }
    },

    // Feature flags
    features: {
        autoRole: false,
        welcomeMessages: false,
        ticketSystem: false,
        reactionRoles: false,
        customCommands: false,
        musicBot: false,
        economySystem: false
    },

    // Security settings
    security: {
        // Bot permissions validation
        validatePermissions: true,
        requiredPermissions: [
            'ViewChannel',
            'SendMessages',
            'ManageMessages',
            'KickMembers',
            'BanMembers',
            'ModerateMembers',
            'ManageRoles',
            'ViewAuditLog'
        ],
        
        // Rate limiting
        rateLimiting: {
            enabled: true,
            commandsPerMinute: 30,
            actionsPerMinute: 10
        },
        
        // Backup and recovery
        backup: {
            enabled: false,
            interval: 86400000, // 24 hours
            location: './backups/',
            maxBackups: 7
        }
    }
};
