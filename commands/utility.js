const { logger } = require('../logger.js');
const utils = require('../utils.js');
const config = require('../config.js');

/**
 * Utility commands for the Security Bot
 */

const pingCommand = {
    name: 'ping',
    description: 'Check bot latency and response time',
    category: 'utility',
    permissions: [],
    cooldown: 3000, // 3 seconds
    
    async execute(interaction) {
        const sent = await interaction.reply({ 
            content: '🏓 Pinging...', 
            fetchReply: true 
        });
        
        const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const wsLatency = interaction.client.ws.ping;
        
        const embed = utils.createModerationEmbed(
            '🏓 Pong!',
            'Bot latency information',
            '#00ff00',
            [
                { name: 'Roundtrip Latency', value: `${roundtripLatency}ms`, inline: true },
                { name: 'WebSocket Latency', value: `${wsLatency}ms`, inline: true },
                { name: 'Status', value: wsLatency < 100 ? '🟢 Excellent' : wsLatency < 200 ? '🟡 Good' : '🔴 Poor', inline: true }
            ]
        );
        
        await interaction.editReply({ content: null, embeds: [embed] });
        
        logger.logMetric('ping_roundtrip', roundtripLatency, 'ms');
        logger.logMetric('ping_websocket', wsLatency, 'ms');
    }
};

const statusCommand = {
    name: 'status',
    description: 'Show current bot configuration and status',
    category: 'utility',
    permissions: [],
    cooldown: 5000, // 5 seconds
    
    async execute(interaction) {
        const client = interaction.client;
        const uptime = utils.formatDuration(client.uptime);
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

        // Get guild-specific configuration
        const guildConfig = client.configManager ?
            client.configManager.getGuildConfig(interaction.guild.id) :
            config; // Fallback to global config

        const embed = utils.createModerationEmbed(
            '🛡️ Security Bot Status',
            `Current configuration and system status for **${interaction.guild.name}**`,
            '#00ff00',
            [
                { name: '🔧 Guild Configuration', value: '\u200b', inline: false },
                { name: 'Spam Detection', value: guildConfig.spam.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Link Detection', value: guildConfig.links.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Mention Detection', value: guildConfig.mentions.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Raid Protection', value: guildConfig.raidProtection.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Auto Moderation', value: guildConfig.moderation.autoModeration ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Max Warnings', value: guildConfig.moderation.maxWarnings.toString(), inline: true },

                { name: '📊 System Performance', value: '\u200b', inline: false },
                { name: 'Uptime', value: uptime, inline: true },
                { name: 'Memory Usage', value: `${memoryMB} MB`, inline: true },
                { name: 'Latency', value: `${client.ws.ping}ms`, inline: true },

                { name: '🌐 Network Statistics', value: '\u200b', inline: false },
                { name: 'Total Servers', value: client.guilds.cache.size.toString(), inline: true },
                { name: 'Total Users', value: client.users.cache.size.toString(), inline: true },
                { name: 'Total Channels', value: client.channels.cache.size.toString(), inline: true },

                { name: '🛡️ Security Status', value: '\u200b', inline: false },
                { name: 'Commands Available', value: client.commandHandler ? client.commandHandler.getAllCommands().size.toString() : 'Unknown', inline: true },
                { name: 'Bot Version', value: '2.2.0', inline: true },
                { name: 'Status', value: '🟢 Operational', inline: true }
            ]
        );

        await interaction.reply({ embeds: [embed] });

        logger.logMetric('memory_usage', memoryMB, 'MB', {
            guildId: interaction.guild.id,
            guildName: interaction.guild.name
        });
        logger.logMetric('guild_count', client.guilds.cache.size);
        logger.logMetric('user_count', client.users.cache.size);
    }
};

const helpCommand = {
    name: 'help',
    description: 'Show help information and available commands',
    category: 'utility',
    permissions: [],
    cooldown: 5000, // 5 seconds
    
    async execute(interaction) {
        const commandHandler = interaction.client.commandHandler;
        const commands = commandHandler.getAllCommands();
        
        // Group commands by category
        const categories = {};
        for (const command of commands.values()) {
            const category = command.category || 'uncategorized';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(command);
        }
        
        const fields = [];
        
        // Add category sections
        for (const [categoryName, categoryCommands] of Object.entries(categories)) {
            const commandList = categoryCommands
                .map(cmd => `\`/${cmd.name}\` - ${cmd.description}`)
                .join('\n');
            
            fields.push({
                name: `${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Commands`,
                value: commandList || 'No commands',
                inline: false
            });
        }
        
        // Add usage information
        fields.push({
            name: '📖 Usage Information',
            value: '• Use `/command` to execute commands\n• Some commands require specific permissions\n• Commands have cooldowns to prevent spam',
            inline: false
        });
        
        fields.push({
            name: '🔗 Links',
            value: '• [Documentation](https://github.com/your-username/security-bot)\n• [Support Server](https://discord.gg/your-invite)\n• [Report Issues](https://github.com/your-username/security-bot/issues)',
            inline: false
        });
        
        const embed = utils.createModerationEmbed(
            '🛡️ Security Bot Help',
            `Available commands and information\n\nTotal Commands: ${commands.size}`,
            '#0099ff',
            fields
        );
        
        await interaction.reply({ embeds: [embed] });
    }
};

const warningsCommand = {
    name: 'warnings',
    description: 'View warnings for a user',
    category: 'utility',
    permissions: ['KickMembers'],
    cooldown: 3000, // 3 seconds
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target') || interaction.user;

        try {
            let warnings = [];
            let warningCount = 0;
            let userStats = null;

            // Get warnings from database if available
            if (interaction.client.userService) {
                warnings = await interaction.client.userService.getUserWarnings(
                    interaction.guild.id,
                    targetUser.id
                );
                warningCount = warnings.length;

                // Get comprehensive user stats
                userStats = await interaction.client.userService.getUserStats(
                    interaction.guild.id,
                    targetUser.id
                );
            }

            if (warningCount === 0) {
                return interaction.reply({
                    content: `${targetUser.tag} has no active warnings.`,
                    ephemeral: true
                });
            }

            const fields = [];

            // Add user stats if available
            if (userStats) {
                fields.push({
                    name: '📊 User Statistics',
                    value: `Risk Level: **${userStats.riskLevel.toUpperCase()}**\nReputation: ${userStats.reputation.reputation_score}\nTotal Violations: ${userStats.violations.total}`,
                    inline: false
                });
            }

            // Add recent warnings
            const recentWarnings = warnings.slice(0, 5).map((warning, index) => ({
                name: `Warning ${index + 1}`,
                value: `**Reason:** ${warning.reason}\n**Date:** ${new Date(warning.created_at).toLocaleDateString()}\n**Type:** ${warning.warning_type}\n**Severity:** ${warning.severity}`,
                inline: false
            }));

            fields.push(...recentWarnings);

            if (warnings.length > 5) {
                fields.push({
                    name: 'Note',
                    value: `Showing 5 of ${warnings.length} warnings. Use \`/stats\` for more detailed information.`,
                    inline: false
                });
            }

            const embed = utils.createModerationEmbed(
                `⚠️ Warnings for ${targetUser.tag}`,
                `Total active warnings: ${warningCount}`,
                '#ffaa00',
                fields
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('Error fetching user warnings:', {
                error: error.message,
                userId: targetUser.id,
                guildId: interaction.guild.id
            });

            await interaction.reply({
                content: '❌ An error occurred while fetching user warnings.',
                ephemeral: true
            });
        }
    }
};

const infoCommand = {
    name: 'info',
    description: 'Get information about a user or server',
    category: 'utility',
    permissions: [],
    cooldown: 5000, // 5 seconds
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        
        if (targetUser) {
            // User info
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            
            const fields = [
                { name: 'User ID', value: targetUser.id, inline: true },
                { name: 'Username', value: targetUser.tag, inline: true },
                { name: 'Account Created', value: targetUser.createdAt.toDateString(), inline: true }
            ];
            
            if (member) {
                fields.push(
                    { name: 'Joined Server', value: member.joinedAt.toDateString(), inline: true },
                    { name: 'Roles', value: member.roles.cache.size.toString(), inline: true },
                    { name: 'Nickname', value: member.nickname || 'None', inline: true }
                );
            }
            
            const embed = utils.createModerationEmbed(
                `👤 User Information`,
                `Information about ${targetUser.tag}`,
                '#0099ff',
                fields
            );
            
            embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
            
            await interaction.reply({ embeds: [embed] });
        } else {
            // Server info
            const guild = interaction.guild;
            const owner = await guild.fetchOwner();
            
            const embed = utils.createModerationEmbed(
                `🏰 Server Information`,
                `Information about ${guild.name}`,
                '#0099ff',
                [
                    { name: 'Server ID', value: guild.id, inline: true },
                    { name: 'Owner', value: owner.user.tag, inline: true },
                    { name: 'Created', value: guild.createdAt.toDateString(), inline: true },
                    { name: 'Members', value: guild.memberCount.toString(), inline: true },
                    { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
                    { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
                    { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true },
                    { name: 'Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
                    { name: 'Verification Level', value: guild.verificationLevel.toString(), inline: true }
                ]
            );
            
            if (guild.iconURL()) {
                embed.setThumbnail(guild.iconURL({ dynamic: true }));
            }
            
            await interaction.reply({ embeds: [embed] });
        }
    }
};

module.exports = {
    commands: [pingCommand, statusCommand, helpCommand, warningsCommand, infoCommand]
};
