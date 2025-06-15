const { logger } = require('../logger.js');
const utils = require('../utils.js');

/**
 * Admin commands for the Security Bot
 */

const configCommand = {
    name: 'config',
    description: 'Configure bot settings (Admin only)',
    category: 'admin',
    permissions: ['Administrator'],
    cooldown: 5000, // 5 seconds

    async execute(interaction) {
        const setting = interaction.options.getString('setting');
        const value = interaction.options.getBoolean('value');
        const guildId = interaction.guild.id;

        // Validate setting
        const validSettings = {
            'spam': 'spam.enabled',
            'links': 'links.enabled',
            'mentions': 'mentions.enabled',
            'profanity': 'profanity.enabled',
            'raid': 'raidProtection.enabled'
        };

        if (!validSettings[setting]) {
            const availableSettings = Object.keys(validSettings).join(', ');
            return interaction.reply({
                content: `❌ Invalid setting. Available settings: ${availableSettings}`,
                ephemeral: true
            });
        }

        try {
            // Get current guild configuration
            const configManager = interaction.client.configManager;
            const currentConfig = configManager.getGuildConfig(guildId);

            // Get old value for comparison
            const configPath = validSettings[setting].split('.');
            let oldValue = currentConfig;
            for (const path of configPath) {
                oldValue = oldValue[path];
            }

            // Create update object
            const updates = {};
            let updateSection = updates;
            for (let i = 0; i < configPath.length - 1; i++) {
                updateSection[configPath[i]] = {};
                updateSection = updateSection[configPath[i]];
            }
            updateSection[configPath[configPath.length - 1]] = value;

            // Update configuration
            const result = configManager.updateGuildConfig(guildId, updates);

            if (!result.success) {
                return interaction.reply({
                    content: `❌ Failed to update configuration: ${result.errors?.join(', ') || result.error}`,
                    ephemeral: true
                });
            }

            // Log configuration change
            logger.logSystem('config_changed', {
                setting,
                oldValue,
                newValue: value,
                moderator: interaction.user.tag,
                moderatorId: interaction.user.id,
                guildId,
                guildName: interaction.guild.name
            });

            const embed = utils.createModerationEmbed(
                '⚙️ Configuration Updated',
                `Setting **${setting}** has been updated for this server`,
                '#00ff00',
                [
                    { name: 'Setting', value: setting, inline: true },
                    { name: 'Previous Value', value: oldValue ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'New Value', value: value ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Server', value: interaction.guild.name, inline: true },
                    { name: 'Changed By', value: interaction.user.tag, inline: true },
                    { name: 'Config ID', value: utils.generateId(), inline: true }
                ]
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('Error updating guild configuration:', {
                error: error.message,
                setting,
                value,
                guildId,
                moderator: interaction.user.tag
            });

            await interaction.reply({
                content: '❌ An error occurred while updating the configuration.',
                ephemeral: true
            });
        }
    }
};

const reloadCommand = {
    name: 'reload',
    description: 'Reload bot commands or configuration',
    category: 'admin',
    permissions: ['Administrator'],
    cooldown: 10000, // 10 seconds
    
    async execute(interaction) {
        const type = interaction.options.getString('type') || 'commands';
        
        try {
            await interaction.deferReply({ ephemeral: true });
            
            if (type === 'commands') {
                // Reload command handler
                const commandHandler = interaction.client.commandHandler;
                const oldCount = commandHandler.getAllCommands().size;
                
                // Clear require cache for command files
                const commandFiles = ['./moderation.js', './utility.js', './admin.js'];
                for (const file of commandFiles) {
                    const fullPath = require.resolve(file);
                    delete require.cache[fullPath];
                }
                
                // Reload commands
                commandHandler.loadCommands();
                const newCount = commandHandler.getAllCommands().size;
                
                logger.info('Commands reloaded', {
                    oldCount,
                    newCount,
                    moderator: interaction.user.tag,
                    guildId: interaction.guild.id
                });
                
                const embed = utils.createModerationEmbed(
                    '🔄 Commands Reloaded',
                    'Successfully reloaded all commands',
                    '#00ff00',
                    [
                        { name: 'Commands Loaded', value: newCount.toString(), inline: true },
                        { name: 'Reloaded By', value: interaction.user.tag, inline: true }
                    ]
                );
                
                await interaction.editReply({ embeds: [embed] });
                
            } else if (type === 'config') {
                // Reload configuration for this guild
                const configManager = interaction.client.configManager;
                if (configManager) {
                    // Reload guild configuration from file
                    const guildConfig = configManager.loadGuildConfig(interaction.guild.id);

                    logger.logSystem('config_reloaded', {
                        moderator: interaction.user.tag,
                        moderatorId: interaction.user.id,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name
                    });

                    const embed = utils.createModerationEmbed(
                        '🔄 Configuration Reloaded',
                        'Successfully reloaded guild configuration from file',
                        '#00ff00',
                        [
                            { name: 'Guild', value: interaction.guild.name, inline: true },
                            { name: 'Reloaded By', value: interaction.user.tag, inline: true },
                            { name: 'Config Features', value: `Spam: ${guildConfig.spam.enabled ? '✅' : '❌'}, Links: ${guildConfig.links.enabled ? '✅' : '❌'}, Raid: ${guildConfig.raidProtection.enabled ? '✅' : '❌'}`, inline: false }
                        ]
                    );

                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({
                        content: '❌ Configuration manager not available.'
                    });
                }

            } else {
                await interaction.editReply({
                    content: '❌ Invalid reload type. Use `commands` or `config`.'
                });
            }
            
        } catch (error) {
            logger.error('Error reloading:', { error: error.message });
            await interaction.editReply({
                content: '❌ An error occurred while reloading.'
            });
        }
    }
};

const statsCommand = {
    name: 'stats',
    description: 'View detailed bot statistics (Admin only)',
    category: 'admin',
    permissions: ['Administrator'],
    cooldown: 10000, // 10 seconds
    
    async execute(interaction) {
        const client = interaction.client;
        const commandHandler = client.commandHandler;
        const configManager = client.configManager;
        const spamDetection = client.spamDetection;
        const security = client.security;

        // System stats
        const memoryUsage = process.memoryUsage();
        const uptime = utils.formatDuration(client.uptime);
        const processUptime = utils.formatDuration(process.uptime() * 1000);

        // Bot stats
        const guildCount = client.guilds.cache.size;
        const userCount = client.users.cache.size;
        const channelCount = client.channels.cache.size;

        // Module stats
        const commandStats = commandHandler.getStats();
        const loggerStats = logger.getStats();
        const configStats = configManager.getStats();
        const spamStats = spamDetection.getStats();
        const securityStats = security.getStats();

        // Performance analysis
        const logAnalysis = logger.analyzeLogPatterns();

        const embed = utils.createModerationEmbed(
            '📊 Enhanced Bot Statistics',
            'Comprehensive statistics and performance metrics',
            '#0099ff',
            [
                { name: '🖥️ System Performance', value: '\u200b', inline: false },
                { name: 'Memory Usage', value: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`, inline: true },
                { name: 'Process Uptime', value: processUptime, inline: true },
                { name: 'Bot Uptime', value: uptime, inline: true },

                { name: '🌐 Network & Reach', value: '\u200b', inline: false },
                { name: 'Guilds', value: guildCount.toString(), inline: true },
                { name: 'Users', value: userCount.toString(), inline: true },
                { name: 'Channels', value: channelCount.toString(), inline: true },

                { name: '⚡ Command System', value: '\u200b', inline: false },
                { name: 'Total Commands', value: commandStats.totalCommands.toString(), inline: true },
                { name: 'Active Cooldowns', value: commandStats.activeCooldowns.toString(), inline: true },
                { name: 'Rate Limited Users', value: commandStats.activeRateLimits.toString(), inline: true },

                { name: '🛡️ Security & Spam Detection', value: '\u200b', inline: false },
                { name: 'Active Users Monitored', value: spamStats.activeUsers.toString(), inline: true },
                { name: 'Violated Users', value: spamStats.violatedUsers.toString(), inline: true },
                { name: 'Suspicious Accounts', value: securityStats.suspiciousUsers.toString(), inline: true },

                { name: '⚙️ Configuration', value: '\u200b', inline: false },
                { name: 'Configured Guilds', value: configStats.totalGuilds.toString(), inline: true },
                { name: 'Spam Protection', value: `${configStats.featureUsage.spam}/${guildCount}`, inline: true },
                { name: 'Raid Protection', value: `${configStats.featureUsage.raidProtection}/${guildCount}`, inline: true },

                { name: '📝 Logging System', value: '\u200b', inline: false },
                { name: 'Log Level', value: loggerStats.logLevel.toUpperCase(), inline: true },
                { name: 'Health Score', value: `${logAnalysis.healthScore}/100`, inline: true },
                { name: 'Discord Logging', value: loggerStats.discordLogging ? '✅ Enabled' : '❌ Disabled', inline: true }
            ]
        );

        // Add file size info if available
        if (loggerStats.fileSizeMB) {
            embed.addFields({
                name: 'Log Storage',
                value: `${loggerStats.fileSizeMB} MB (${loggerStats.logFileCount} files)`,
                inline: true
            });
        }

        // Add performance metrics
        if (loggerStats.metrics) {
            embed.addFields({
                name: 'Log Metrics',
                value: `${loggerStats.metrics.totalLogs} total, ${loggerStats.metrics.errorCount} errors`,
                inline: true
            });
        }

        // Add health warnings if any
        if (logAnalysis.issues.length > 0) {
            embed.addFields({
                name: '⚠️ Health Issues',
                value: logAnalysis.issues.slice(0, 3).join('\n'),
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

const maintenanceCommand = {
    name: 'maintenance',
    description: 'Enable or disable maintenance mode',
    category: 'admin',
    permissions: ['Administrator'],
    cooldown: 30000, // 30 seconds
    
    async execute(interaction) {
        const enable = interaction.options.getBoolean('enable');
        const reason = interaction.options.getString('reason') || 'Scheduled maintenance';
        
        // This would typically update a global maintenance flag
        // For now, we'll just log the action
        
        logger.info(`Maintenance mode ${enable ? 'enabled' : 'disabled'}`, {
            enabled: enable,
            reason,
            moderator: interaction.user.tag,
            guildId: interaction.guild.id
        });
        
        const embed = utils.createModerationEmbed(
            enable ? '🔧 Maintenance Mode Enabled' : '✅ Maintenance Mode Disabled',
            enable ? 'The bot is now in maintenance mode' : 'The bot is now operational',
            enable ? '#ff6b6b' : '#00ff00',
            [
                { name: 'Status', value: enable ? '🔧 Maintenance' : '✅ Operational', inline: true },
                { name: 'Reason', value: reason, inline: true },
                { name: 'Changed By', value: interaction.user.tag, inline: true }
            ]
        );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        
        if (enable) {
            // Optionally notify all servers about maintenance
            logger.warn('Bot entered maintenance mode', { reason });
        }
    }
};

const cleanupCommand = {
    name: 'cleanup',
    description: 'Clean up bot caches and temporary data',
    category: 'admin',
    permissions: ['Administrator'],
    cooldown: 60000, // 1 minute
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const beforeMemory = process.memoryUsage().heapUsed;
            let cleanupResults = {
                commandHandler: 0,
                spamDetection: 0,
                security: 0,
                logger: 0,
                configManager: 0
            };

            // Clean up command handler caches
            const commandHandler = interaction.client.commandHandler;
            if (commandHandler) {
                commandHandler.cleanup();
                cleanupResults.commandHandler = 1;
            }

            // Clean up spam detection caches
            const spamDetection = interaction.client.spamDetection;
            if (spamDetection) {
                spamDetection.cleanup();
                cleanupResults.spamDetection = 1;
            }

            // Clean up security module caches
            const security = interaction.client.security;
            if (security) {
                security.cleanup();
                cleanupResults.security = 1;
            }

            // Clean up logger caches and old logs
            if (logger) {
                const logCleanup = logger.cleanupLogs();
                cleanupResults.logger = logCleanup ? logCleanup.deletedFiles : 0;
            }

            // Save all configurations
            const configManager = interaction.client.configManager;
            if (configManager) {
                const saveResult = configManager.saveAllConfigs();
                cleanupResults.configManager = saveResult.saved;
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const afterMemory = process.memoryUsage().heapUsed;
            const memoryFreed = beforeMemory - afterMemory;

            logger.logSystem('manual_cleanup', {
                memoryFreedMB: Math.round(memoryFreed / 1024 / 1024),
                cleanupResults,
                moderator: interaction.user.tag,
                moderatorId: interaction.user.id,
                guildId: interaction.guild.id
            });

            const embed = utils.createModerationEmbed(
                '🧹 Enhanced Cleanup Complete',
                'Successfully cleaned up all bot caches and temporary data',
                '#00ff00',
                [
                    { name: 'Memory Freed', value: `${Math.round(Math.abs(memoryFreed) / 1024 / 1024)} MB`, inline: true },
                    { name: 'Command Caches', value: cleanupResults.commandHandler ? '✅ Cleaned' : '❌ Skipped', inline: true },
                    { name: 'Spam Detection', value: cleanupResults.spamDetection ? '✅ Cleaned' : '❌ Skipped', inline: true },
                    { name: 'Security Module', value: cleanupResults.security ? '✅ Cleaned' : '❌ Skipped', inline: true },
                    { name: 'Log Files Cleaned', value: cleanupResults.logger.toString(), inline: true },
                    { name: 'Configs Saved', value: cleanupResults.configManager.toString(), inline: true },
                    { name: 'Performed By', value: interaction.user.tag, inline: false },
                    { name: 'Cleanup ID', value: utils.generateId(), inline: true }
                ]
            );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('Error during enhanced cleanup:', {
                error: error.message,
                stack: error.stack,
                moderator: interaction.user.tag,
                guildId: interaction.guild.id
            });

            await interaction.editReply({
                content: '❌ An error occurred during cleanup. Check logs for details.'
            });
        }
    }
};

const raidProtectionCommand = {
    name: 'raidprotection',
    description: 'Manage raid protection settings and view status',
    category: 'admin',
    permissions: ['Administrator'],
    cooldown: 10000, // 10 seconds

    async execute(interaction) {
        const action = interaction.options.getString('action') || 'status';
        const guildConfig = interaction.client.configManager.getGuildConfig(interaction.guild.id);

        try {
            switch (action) {
                case 'status':
                    await this.showStatus(interaction, guildConfig);
                    break;
                case 'enable':
                    await this.toggleRaidProtection(interaction, true);
                    break;
                case 'disable':
                    await this.toggleRaidProtection(interaction, false);
                    break;
                case 'lockdown':
                    await this.manageLockdown(interaction, true);
                    break;
                case 'unlock':
                    await this.manageLockdown(interaction, false);
                    break;
                case 'stats':
                    await this.showStatistics(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action. Use: status, enable, disable, lockdown, unlock, stats',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Error in raid protection command:', {
                error: error.message,
                action,
                guildId: interaction.guild.id
            });

            await interaction.reply({
                content: '❌ An error occurred while managing raid protection.',
                ephemeral: true
            });
        }
    },

    async showStatus(interaction, guildConfig) {
        const raidProtection = interaction.client.raidProtection;
        const stats = raidProtection ? raidProtection.getStats() : null;

        const embed = utils.createModerationEmbed(
            '🛡️ Raid Protection Status',
            `Current raid protection configuration for **${interaction.guild.name}**`,
            guildConfig.raidProtection.enabled ? '#00ff00' : '#ff6b6b',
            [
                { name: '🔧 Configuration', value: '\u200b', inline: false },
                { name: 'Status', value: guildConfig.raidProtection.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Join Threshold', value: guildConfig.raidProtection.joinThreshold.toString(), inline: true },
                { name: 'Time Window', value: utils.formatDuration(guildConfig.raidProtection.timeWindow), inline: true },

                { name: '👶 Account Age Protection', value: '\u200b', inline: false },
                { name: 'Enabled', value: guildConfig.raidProtection.accountAge.enabled ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Minimum Age', value: utils.formatDuration(guildConfig.raidProtection.accountAge.minimumAge), inline: true },
                { name: 'Action', value: guildConfig.raidProtection.accountAge.action.toUpperCase(), inline: true },

                { name: '⚡ Actions', value: '\u200b', inline: false },
                { name: 'Lockdown', value: guildConfig.raidProtection.actions.lockdown ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Kick New Members', value: guildConfig.raidProtection.actions.kickNewMembers ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Notify Moderators', value: guildConfig.raidProtection.actions.notifyModerators ? '✅ Enabled' : '❌ Disabled', inline: true }
            ]
        );

        if (stats) {
            embed.addFields({
                name: '📊 Current Statistics',
                value: `Guilds Monitored: ${stats.guildsMonitored}\nActive Raids: ${stats.activeRaids}\nActive Lockdowns: ${stats.activeLockdowns}\nSuspicious Users: ${stats.suspiciousUsers}`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async toggleRaidProtection(interaction, enable) {
        const configManager = interaction.client.configManager;
        const guildId = interaction.guild.id;

        const result = configManager.updateGuildConfig(guildId, {
            raidProtection: { enabled: enable }
        });

        if (!result.success) {
            return interaction.reply({
                content: `❌ Failed to ${enable ? 'enable' : 'disable'} raid protection: ${result.errors?.join(', ')}`,
                ephemeral: true
            });
        }

        logger.logSystem('raid_protection_toggled', {
            guildId,
            guildName: interaction.guild.name,
            enabled: enable,
            moderator: interaction.user.tag,
            moderatorId: interaction.user.id
        });

        const embed = utils.createModerationEmbed(
            `🛡️ Raid Protection ${enable ? 'Enabled' : 'Disabled'}`,
            `Raid protection has been ${enable ? 'enabled' : 'disabled'} for this server`,
            enable ? '#00ff00' : '#ff6b6b',
            [
                { name: 'Status', value: enable ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Changed By', value: interaction.user.tag, inline: true },
                { name: 'Server', value: interaction.guild.name, inline: true }
            ]
        );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async manageLockdown(interaction, activate) {
        const raidProtection = interaction.client.raidProtection;
        const guildConfig = interaction.client.configManager.getGuildConfig(interaction.guild.id);

        if (!raidProtection) {
            return interaction.reply({
                content: '❌ Raid protection system is not available.',
                ephemeral: true
            });
        }

        try {
            if (activate) {
                await raidProtection.activateLockdown(interaction.guild, guildConfig);

                const embed = utils.createModerationEmbed(
                    '🔒 Server Lockdown Activated',
                    'Manual server lockdown has been activated',
                    '#ff6b6b',
                    [
                        { name: 'Activated By', value: interaction.user.tag, inline: true },
                        { name: 'Duration', value: utils.formatDuration(guildConfig.raidProtection.lockdownDuration || 600000), inline: true },
                        { name: 'Reason', value: 'Manual activation', inline: true }
                    ]
                );

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else {
                await raidProtection.deactivateLockdown(interaction.guild);

                const embed = utils.createModerationEmbed(
                    '🔓 Server Lockdown Deactivated',
                    'Server lockdown has been manually deactivated',
                    '#00ff00',
                    [
                        { name: 'Deactivated By', value: interaction.user.tag, inline: true },
                        { name: 'Status', value: '✅ Server Unlocked', inline: true }
                    ]
                );

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Log action
            logger.logSystem('manual_lockdown', {
                guildId: interaction.guild.id,
                guildName: interaction.guild.name,
                action: activate ? 'activate' : 'deactivate',
                moderator: interaction.user.tag,
                moderatorId: interaction.user.id
            });

        } catch (error) {
            logger.error('Error managing lockdown:', {
                error: error.message,
                guildId: interaction.guild.id,
                activate
            });

            await interaction.reply({
                content: `❌ Failed to ${activate ? 'activate' : 'deactivate'} lockdown.`,
                ephemeral: true
            });
        }
    },

    async showStatistics(interaction) {
        const raidProtection = interaction.client.raidProtection;

        if (!raidProtection) {
            return interaction.reply({
                content: '❌ Raid protection system is not available.',
                ephemeral: true
            });
        }

        const stats = raidProtection.getStats();

        // Get database statistics if available
        let dbStats = null;
        if (interaction.client.database) {
            try {
                const securityEvents = await interaction.client.database.all(
                    `SELECT event_type, COUNT(*) as count
                     FROM security_events
                     WHERE guild_id = ? AND event_type LIKE '%RAID%'
                     GROUP BY event_type`,
                    [interaction.guild.id]
                );

                dbStats = securityEvents.reduce((acc, event) => {
                    acc[event.event_type] = event.count;
                    return acc;
                }, {});
            } catch (error) {
                logger.debug('Could not fetch raid statistics from database:', { error: error.message });
            }
        }

        const embed = utils.createModerationEmbed(
            '📊 Raid Protection Statistics',
            `Comprehensive raid protection statistics for **${interaction.guild.name}**`,
            '#0099ff',
            [
                { name: '🛡️ System Status', value: '\u200b', inline: false },
                { name: 'Guilds Monitored', value: stats.guildsMonitored.toString(), inline: true },
                { name: 'Active Raids', value: stats.activeRaids.toString(), inline: true },
                { name: 'Active Lockdowns', value: stats.activeLockdowns.toString(), inline: true },
                { name: 'Suspicious Users', value: stats.suspiciousUsers.toString(), inline: true },
                { name: 'Joins Tracked', value: stats.totalJoinsTracked.toString(), inline: true },
                { name: 'System Health', value: '🟢 Operational', inline: true }
            ]
        );

        if (dbStats && Object.keys(dbStats).length > 0) {
            const dbStatsText = Object.entries(dbStats)
                .map(([event, count]) => `${event}: ${count}`)
                .join('\n');

            embed.addFields({
                name: '📈 Historical Data',
                value: dbStatsText,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

const contentFilterCommand = {
    name: 'contentfilter',
    description: 'Manage content filtering settings',
    category: 'admin',
    permissions: ['Administrator'],
    cooldown: 5000, // 5 seconds

    async execute(interaction) {
        const action = interaction.options.getString('action') || 'status';
        const word = interaction.options.getString('word');
        const user = interaction.options.getUser('user');

        try {
            switch (action) {
                case 'status':
                    await this.showStatus(interaction);
                    break;
                case 'enable':
                    await this.toggleFilter(interaction, true);
                    break;
                case 'disable':
                    await this.toggleFilter(interaction, false);
                    break;
                case 'add-word':
                    if (!word) {
                        return interaction.reply({
                            content: '❌ Please provide a word to add.',
                            ephemeral: true
                        });
                    }
                    await this.addCustomWord(interaction, word);
                    break;
                case 'remove-word':
                    if (!word) {
                        return interaction.reply({
                            content: '❌ Please provide a word to remove.',
                            ephemeral: true
                        });
                    }
                    await this.removeCustomWord(interaction, word);
                    break;
                case 'whitelist-add':
                    if (!user) {
                        return interaction.reply({
                            content: '❌ Please provide a user to whitelist.',
                            ephemeral: true
                        });
                    }
                    await this.addToWhitelist(interaction, user);
                    break;
                case 'whitelist-remove':
                    if (!user) {
                        return interaction.reply({
                            content: '❌ Please provide a user to remove from whitelist.',
                            ephemeral: true
                        });
                    }
                    await this.removeFromWhitelist(interaction, user);
                    break;
                case 'stats':
                    await this.showStatistics(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Error in content filter command:', {
                error: error.message,
                action,
                guildId: interaction.guild.id
            });

            await interaction.reply({
                content: '❌ An error occurred while managing content filter.',
                ephemeral: true
            });
        }
    },

    async showStatus(interaction) {
        const contentFilter = interaction.client.contentFilter;
        const stats = contentFilter.getStats();

        const embed = utils.createModerationEmbed(
            '🔍 Content Filter Status',
            `Content filtering configuration for **${interaction.guild.name}**`,
            stats.enabled ? '#00ff00' : '#ff6b6b',
            [
                { name: '🔧 Configuration', value: '\u200b', inline: false },
                { name: 'Status', value: stats.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Strict Mode', value: stats.strictMode ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Languages', value: stats.languages.toString(), inline: true },

                { name: '📚 Word Lists', value: '\u200b', inline: false },
                { name: 'Total Words', value: stats.totalWords.toString(), inline: true },
                { name: 'Custom Words', value: stats.customWords.toString(), inline: true },
                { name: 'Whitelisted Users', value: stats.whitelistedUsers.toString(), inline: true },

                { name: '📁 File Filtering', value: '\u200b', inline: false },
                { name: 'Allowed Types', value: stats.allowedFileTypes.toString(), inline: true },
                { name: 'Cache Size', value: stats.cacheSize.toString(), inline: true },
                { name: 'Performance', value: '🟢 Optimal', inline: true }
            ]
        );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async toggleFilter(interaction, enable) {
        const contentFilter = interaction.client.contentFilter;
        contentFilter.config.enabled = enable;

        logger.logSystem('content_filter_toggled', {
            guildId: interaction.guild.id,
            guildName: interaction.guild.name,
            enabled: enable,
            moderator: interaction.user.tag,
            moderatorId: interaction.user.id
        });

        const embed = utils.createModerationEmbed(
            `🔍 Content Filter ${enable ? 'Enabled' : 'Disabled'}`,
            `Content filtering has been ${enable ? 'enabled' : 'disabled'} for this server`,
            enable ? '#00ff00' : '#ff6b6b',
            [
                { name: 'Status', value: enable ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Changed By', value: interaction.user.tag, inline: true },
                { name: 'Server', value: interaction.guild.name, inline: true }
            ]
        );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async addCustomWord(interaction, word) {
        const contentFilter = interaction.client.contentFilter;
        const added = contentFilter.addCustomWord(word.toLowerCase());

        if (added) {
            const embed = utils.createModerationEmbed(
                '📝 Custom Word Added',
                `Word "${word}" has been added to the content filter`,
                '#00ff00',
                [
                    { name: 'Word', value: word, inline: true },
                    { name: 'Added By', value: interaction.user.tag, inline: true },
                    { name: 'Total Custom Words', value: contentFilter.config.customWords.length.toString(), inline: true }
                ]
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({
                content: `❌ Word "${word}" is already in the filter.`,
                ephemeral: true
            });
        }
    },

    async removeCustomWord(interaction, word) {
        const contentFilter = interaction.client.contentFilter;
        const removed = contentFilter.removeCustomWord(word.toLowerCase());

        if (removed) {
            const embed = utils.createModerationEmbed(
                '🗑️ Custom Word Removed',
                `Word "${word}" has been removed from the content filter`,
                '#ff6b6b',
                [
                    { name: 'Word', value: word, inline: true },
                    { name: 'Removed By', value: interaction.user.tag, inline: true },
                    { name: 'Total Custom Words', value: contentFilter.config.customWords.length.toString(), inline: true }
                ]
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({
                content: `❌ Word "${word}" is not in the filter.`,
                ephemeral: true
            });
        }
    },

    async addToWhitelist(interaction, user) {
        const contentFilter = interaction.client.contentFilter;
        const added = contentFilter.addToWhitelist(user.id);

        if (added) {
            const embed = utils.createModerationEmbed(
                '✅ User Whitelisted',
                `${user.tag} has been added to the content filter whitelist`,
                '#00ff00',
                [
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Added By', value: interaction.user.tag, inline: true },
                    { name: 'Total Whitelisted', value: contentFilter.config.whitelist.length.toString(), inline: true }
                ]
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({
                content: `❌ ${user.tag} is already whitelisted.`,
                ephemeral: true
            });
        }
    },

    async removeFromWhitelist(interaction, user) {
        const contentFilter = interaction.client.contentFilter;
        const removed = contentFilter.removeFromWhitelist(user.id);

        if (removed) {
            const embed = utils.createModerationEmbed(
                '❌ User Removed from Whitelist',
                `${user.tag} has been removed from the content filter whitelist`,
                '#ff6b6b',
                [
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Removed By', value: interaction.user.tag, inline: true },
                    { name: 'Total Whitelisted', value: contentFilter.config.whitelist.length.toString(), inline: true }
                ]
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({
                content: `❌ ${user.tag} is not in the whitelist.`,
                ephemeral: true
            });
        }
    },

    async showStatistics(interaction) {
        const contentFilter = interaction.client.contentFilter;
        const stats = contentFilter.getStats();

        // Get database statistics if available
        let dbStats = null;
        if (interaction.client.database) {
            try {
                const violations = await interaction.client.database.all(
                    `SELECT COUNT(*) as count FROM user_violations
                     WHERE guild_id = ? AND violation_type = 'content_filter'`,
                    [interaction.guild.id]
                );

                dbStats = violations[0]?.count || 0;
            } catch (error) {
                logger.debug('Could not fetch content filter statistics from database:', { error: error.message });
            }
        }

        const embed = utils.createModerationEmbed(
            '📊 Content Filter Statistics',
            `Comprehensive content filtering statistics for **${interaction.guild.name}**`,
            '#0099ff',
            [
                { name: '🔍 Filter Status', value: '\u200b', inline: false },
                { name: 'Enabled', value: stats.enabled ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Strict Mode', value: stats.strictMode ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Languages', value: stats.languages.toString(), inline: true },

                { name: '📚 Word Database', value: '\u200b', inline: false },
                { name: 'Total Words', value: stats.totalWords.toString(), inline: true },
                { name: 'Custom Words', value: stats.customWords.toString(), inline: true },
                { name: 'Cache Size', value: stats.cacheSize.toString(), inline: true },

                { name: '👥 User Management', value: '\u200b', inline: false },
                { name: 'Whitelisted Users', value: stats.whitelistedUsers.toString(), inline: true },
                { name: 'File Types Allowed', value: stats.allowedFileTypes.toString(), inline: true },
                { name: 'System Health', value: '🟢 Operational', inline: true }
            ]
        );

        if (dbStats !== null) {
            embed.addFields({
                name: '📈 Historical Data',
                value: `Content Violations: ${dbStats}`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

module.exports = {
    commands: [configCommand, reloadCommand, statsCommand, maintenanceCommand, cleanupCommand, raidProtectionCommand, contentFilterCommand]
};
