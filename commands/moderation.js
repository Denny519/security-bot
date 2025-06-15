const { logger } = require('../logger.js');
const utils = require('../utils.js');

/**
 * Moderation commands for the Security Bot
 */

const kickCommand = {
    name: 'kick',
    description: 'Kick a user from the server',
    category: 'moderation',
    permissions: ['KickMembers'],
    cooldown: 5000, // 5 seconds
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        // Validation
        if (!targetUser) {
            return interaction.reply({
                content: '❌ Please specify a user to kick.',
                ephemeral: true
            });
        }
        
        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Cannot kick bots.',
                ephemeral: true
            });
        }
        
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot kick yourself.',
                ephemeral: true
            });
        }
        
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                ephemeral: true
            });
        }
        
        if (!member.kickable) {
            return interaction.reply({
                content: '❌ Cannot kick this user. They may have higher permissions than the bot.',
                ephemeral: true
            });
        }
        
        // Execute kick
        try {
            // Send DM to user before kicking (if possible)
            try {
                const dmEmbed = utils.createModerationEmbed(
                    '🔨 You have been kicked',
                    `You have been kicked from **${interaction.guild.name}**`,
                    '#ff6b6b',
                    [
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Moderator', value: interaction.user.tag, inline: true }
                    ]
                );
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                logger.debug('Could not send DM to user before kick:', { error: dmError.message });
            }

            await member.kick(`Kicked by ${interaction.user.tag}: ${reason}`);

            // Log action
            logger.logModeration('KICK', targetUser, reason, interaction.guild, interaction.user);

            // Log to database if available
            if (interaction.client.moderationService) {
                await interaction.client.moderationService.logAction(
                    interaction.guild.id,
                    targetUser.id,
                    interaction.user.id,
                    'KICK',
                    { reason }
                );
            }

            // Create embed for response
            const embed = utils.createModerationEmbed(
                '🔨 User Kicked',
                `${targetUser.tag} has been kicked from the server`,
                '#ff6b6b',
                [
                    { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: utils.truncateText(reason, 1000), inline: false }
                ]
            );

            return interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('Error executing kick command:', {
                error: error.message,
                stack: error.stack,
                targetUserId: targetUser.id,
                guildId: interaction.guild.id,
                moderatorId: interaction.user.id
            });

            const errorMessage = error.message.includes('Missing Permissions')
                ? '❌ I do not have permission to kick this user.'
                : error.message.includes('Unknown Member')
                ? '❌ User not found or already left the server.'
                : '❌ An error occurred while trying to kick the user.';

            return interaction.reply({
                content: errorMessage,
                ephemeral: true
            });
        }
    }
};

const banCommand = {
    name: 'ban',
    description: 'Ban a user from the server',
    category: 'moderation',
    permissions: ['BanMembers'],
    cooldown: 5000, // 5 seconds
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteDays = interaction.options.getInteger('delete_days') || 0;
        
        // Validation
        if (!targetUser) {
            return interaction.reply({
                content: '❌ Please specify a user to ban.',
                ephemeral: true
            });
        }
        
        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Cannot ban bots.',
                ephemeral: true
            });
        }
        
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot ban yourself.',
                ephemeral: true
            });
        }
        
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (member && !member.bannable) {
            return interaction.reply({
                content: '❌ Cannot ban this user. They may have higher permissions than the bot.',
                ephemeral: true
            });
        }
        
        // Execute ban
        try {
            // Validate reason input
            const reasonValidation = utils.validateInput(reason, {
                maxLength: 512,
                minLength: 1,
                stripHtml: true,
                blockedWords: ['token', 'password']
            });

            if (!reasonValidation.isValid) {
                return interaction.reply({
                    content: `❌ Invalid reason: ${reasonValidation.errors.join(', ')}`,
                    ephemeral: true
                });
            }

            const sanitizedReason = reasonValidation.sanitized;

            // Send DM to user before banning (if possible)
            try {
                const dmEmbed = utils.createModerationEmbed(
                    '🔨 You have been banned',
                    `You have been banned from **${interaction.guild.name}**`,
                    '#ff0000',
                    [
                        { name: 'Reason', value: sanitizedReason, inline: false },
                        { name: 'Moderator', value: interaction.user.tag, inline: true },
                        { name: 'Appeal', value: 'Contact server administrators if you believe this was a mistake', inline: false }
                    ]
                );
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                logger.debug('Could not send DM to user before ban:', { error: dmError.message });
            }

            await interaction.guild.members.ban(targetUser.id, {
                reason: `Banned by ${interaction.user.tag}: ${sanitizedReason}`,
                deleteMessageDays: deleteDays
            });

            // Log action with additional details
            logger.logModeration('BAN', targetUser, sanitizedReason, interaction.guild, interaction.user);

            // Create enhanced embed for response
            const embed = utils.createModerationEmbed(
                '🔨 User Banned',
                `${targetUser.tag} has been permanently banned from the server`,
                '#ff0000',
                [
                    { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Messages Deleted', value: `${deleteDays} days`, inline: true },
                    { name: 'Reason', value: utils.truncateText(sanitizedReason, 1000), inline: false },
                    { name: 'Ban ID', value: utils.generateId(), inline: true },
                    { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                ]
            );

            return interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('Error executing ban command:', {
                error: error.message,
                stack: error.stack,
                targetUserId: targetUser.id,
                guildId: interaction.guild.id,
                moderatorId: interaction.user.id
            });

            const errorMessage = error.message.includes('Missing Permissions')
                ? '❌ I do not have permission to ban this user.'
                : error.message.includes('Unknown Member')
                ? '❌ User not found or already banned.'
                : '❌ An error occurred while trying to ban the user.';

            return interaction.reply({
                content: errorMessage,
                ephemeral: true
            });
        }
    }
};

const timeoutCommand = {
    name: 'timeout',
    description: 'Timeout a user for a specified duration',
    category: 'moderation',
    permissions: ['ModerateMembers'],
    cooldown: 3000, // 3 seconds
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration'); // in minutes
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        // Validation
        if (!targetUser) {
            return interaction.reply({
                content: '❌ Please specify a user to timeout.',
                ephemeral: true
            });
        }
        
        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Cannot timeout bots.',
                ephemeral: true
            });
        }
        
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot timeout yourself.',
                ephemeral: true
            });
        }
        
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                ephemeral: true
            });
        }
        
        if (!member.moderatable) {
            return interaction.reply({
                content: '❌ Cannot timeout this user. They may have higher permissions than the bot.',
                ephemeral: true
            });
        }
        
        // Execute timeout
        try {
            // Validate duration (Discord max is 28 days = 40320 minutes)
            if (duration < 1 || duration > 40320) {
                return interaction.reply({
                    content: '❌ Timeout duration must be between 1 minute and 28 days (40320 minutes).',
                    ephemeral: true
                });
            }

            // Validate reason input
            const reasonValidation = utils.validateInput(reason, {
                maxLength: 512,
                minLength: 1,
                stripHtml: true
            });

            if (!reasonValidation.isValid) {
                return interaction.reply({
                    content: `❌ Invalid reason: ${reasonValidation.errors.join(', ')}`,
                    ephemeral: true
                });
            }

            const sanitizedReason = reasonValidation.sanitized;
            const timeoutDuration = duration * 60 * 1000; // Convert to milliseconds
            const expiresAt = new Date(Date.now() + timeoutDuration);

            // Send DM to user before timeout (if possible)
            try {
                const dmEmbed = utils.createModerationEmbed(
                    '⏰ You have been timed out',
                    `You have been timed out in **${interaction.guild.name}**`,
                    '#ffa500',
                    [
                        { name: 'Duration', value: utils.formatDuration(timeoutDuration), inline: true },
                        { name: 'Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: true },
                        { name: 'Reason', value: sanitizedReason, inline: false },
                        { name: 'Moderator', value: interaction.user.tag, inline: true }
                    ]
                );
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                logger.debug('Could not send DM to user before timeout:', { error: dmError.message });
            }

            await member.timeout(timeoutDuration, `Timed out by ${interaction.user.tag}: ${sanitizedReason}`);

            // Log action with enhanced details
            logger.logModeration('TIMEOUT', targetUser, `${sanitizedReason} (${duration} minutes)`, interaction.guild, interaction.user);

            // Create enhanced embed for response
            const embed = utils.createModerationEmbed(
                '⏰ User Timed Out',
                `${targetUser.tag} has been timed out`,
                '#ffa500',
                [
                    { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Duration', value: utils.formatDuration(timeoutDuration), inline: true },
                    { name: 'Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
                    { name: 'Timeout ID', value: utils.generateId(), inline: true },
                    { name: 'Reason', value: utils.truncateText(sanitizedReason, 1000), inline: false }
                ]
            );

            return interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('Error executing timeout command:', {
                error: error.message,
                stack: error.stack,
                targetUserId: targetUser.id,
                guildId: interaction.guild.id,
                moderatorId: interaction.user.id,
                duration
            });

            const errorMessage = error.message.includes('Missing Permissions')
                ? '❌ I do not have permission to timeout this user.'
                : error.message.includes('Unknown Member')
                ? '❌ User not found in this server.'
                : error.message.includes('Cannot timeout')
                ? '❌ Cannot timeout this user (they may have higher permissions).'
                : '❌ An error occurred while trying to timeout the user.';

            return interaction.reply({
                content: errorMessage,
                ephemeral: true
            });
        }
    }
};

const warnCommand = {
    name: 'warn',
    description: 'Issue a warning to a user',
    category: 'moderation',
    permissions: ['KickMembers'],
    cooldown: 2000, // 2 seconds
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');
        
        // Validation
        if (!targetUser) {
            return interaction.reply({
                content: '❌ Please specify a user to warn.',
                ephemeral: true
            });
        }
        
        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Cannot warn bots.',
                ephemeral: true
            });
        }
        
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot warn yourself.',
                ephemeral: true
            });
        }
        
        // Add warning (this would typically use a database)
        // For now, we'll use the in-memory system from the main bot
        const warningId = utils.generateId();
        
        // Log action
        logger.logModeration('WARN', targetUser, reason, interaction.guild, interaction.user);
        
        // Send DM to user
        try {
            const dmEmbed = utils.createModerationEmbed(
                '⚠️ Warning Received',
                `You have been warned in **${interaction.guild.name}**`,
                '#ffaa00',
                [
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Warning ID', value: warningId, inline: true }
                ]
            );
            await targetUser.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            logger.debug('Could not send DM to user:', { error: dmError.message });
        }
        
        // Create embed for response
        const embed = utils.createModerationEmbed(
            '⚠️ Warning Issued',
            `${targetUser.tag} has been warned`,
            '#ffaa00',
            [
                { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Warning ID', value: warningId, inline: true },
                { name: 'Reason', value: reason, inline: false }
            ]
        );
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

const clearCommand = {
    name: 'clear',
    description: 'Clear messages from a channel',
    category: 'moderation',
    permissions: ['ManageMessages'],
    cooldown: 10000, // 10 seconds
    
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('target');
        
        // Validation
        if (amount < 1 || amount > 100) {
            return interaction.reply({
                content: '❌ Please specify a number between 1 and 100.',
                ephemeral: true
            });
        }
        
        try {
            await interaction.deferReply({ ephemeral: true });

            // Safety check for amount
            if (amount > 100) {
                return interaction.editReply({
                    content: '❌ Cannot delete more than 100 messages at once for safety reasons.'
                });
            }

            // Fetch messages with error handling
            let messages;
            try {
                messages = await interaction.channel.messages.fetch({
                    limit: Math.min(amount + 10, 100) // Fetch a few extra to account for filtering
                });
            } catch (fetchError) {
                logger.error('Error fetching messages for clear command:', { error: fetchError.message });
                return interaction.editReply({
                    content: '❌ Failed to fetch messages. I may not have permission to read message history.'
                });
            }

            // Filter messages based on criteria
            let messagesToDelete = messages;

            // Filter by target user if specified
            if (targetUser) {
                messagesToDelete = messagesToDelete.filter(msg => msg.author.id === targetUser.id);
            }

            // Filter out pinned messages (safety feature)
            messagesToDelete = messagesToDelete.filter(msg => !msg.pinned);

            // Filter out messages older than 14 days (Discord limitation)
            const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            messagesToDelete = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);

            // Limit to requested amount
            messagesToDelete = messagesToDelete.first(amount);

            if (messagesToDelete.size === 0) {
                return interaction.editReply({
                    content: '❌ No messages found to delete. Messages may be too old (>14 days), pinned, or the target user has no recent messages.'
                });
            }

            // Log warning for large bulk delete operations
            if (messagesToDelete.size > 50 && !targetUser) {
                logger.warn('Large bulk delete operation', {
                    moderator: interaction.user.tag,
                    channel: interaction.channel.name,
                    messageCount: messagesToDelete.size,
                    guildId: interaction.guild.id
                });
            }

            // Delete messages with enhanced error handling
            let deleted;
            try {
                deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
            } catch (deleteError) {
                logger.error('Error deleting messages:', {
                    error: deleteError.message,
                    messageCount: messagesToDelete.size
                });

                if (deleteError.message.includes('Missing Permissions')) {
                    return interaction.editReply({
                        content: '❌ I do not have permission to delete messages in this channel.'
                    });
                } else if (deleteError.message.includes('too old')) {
                    return interaction.editReply({
                        content: '❌ Some messages are too old to delete (older than 14 days).'
                    });
                } else {
                    return interaction.editReply({
                        content: '❌ An error occurred while deleting messages. Some messages may be too old or protected.'
                    });
                }
            }

            // Log action with detailed information
            logger.logModeration('CLEAR', interaction.user,
                `Deleted ${deleted.size} messages in #${interaction.channel.name}${targetUser ? ` from ${targetUser.tag}` : ''}`,
                interaction.guild, interaction.user
            );

            // Create enhanced embed for response
            const embed = utils.createModerationEmbed(
                '🧹 Messages Cleared',
                `Successfully deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'}`,
                '#00ff00',
                [
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Channel', value: `#${interaction.channel.name}`, inline: true },
                    { name: 'Target User', value: targetUser ? targetUser.tag : 'All users', inline: true },
                    { name: 'Requested', value: amount.toString(), inline: true },
                    { name: 'Actually Deleted', value: deleted.size.toString(), inline: true },
                    { name: 'Clear ID', value: utils.generateId(), inline: true }
                ]
            );

            // Add warning if fewer messages were deleted than requested
            if (deleted.size < amount) {
                embed.addFields({
                    name: '⚠️ Note',
                    value: `Fewer messages were deleted than requested. This may be due to message age limits, pinned messages, or filtering.`,
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('Error executing clear command:', {
                error: error.message,
                stack: error.stack,
                amount,
                targetUserId: targetUser?.id,
                channelId: interaction.channel.id
            });

            const errorMessage = '❌ An unexpected error occurred while trying to clear messages.';

            if (interaction.deferred) {
                return interaction.editReply({ content: errorMessage });
            } else {
                return interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};

module.exports = {
    commands: [kickCommand, banCommand, timeoutCommand, warnCommand, clearCommand]
};
