const { Collection } = require('discord.js');
const { logger } = require('../logger.js');
const utils = require('../utils.js');

/**
 * Advanced command handler system
 */
class CommandHandler {
    constructor(client) {
        this.client = client;
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.rateLimits = new Collection();
        
        // Load all commands
        this.loadCommands();
    }
    
    /**
     * Load all command modules
     */
    loadCommands() {
        // Clear existing commands first
        this.commands.clear();

        const commandFiles = [
            './moderation.js',
            './utility.js',
            './admin.js'
        ];

        let loadedCount = 0;
        let errorCount = 0;

        for (const file of commandFiles) {
            try {
                // Clear require cache for hot reloading
                const fullPath = require.resolve(file);
                delete require.cache[fullPath];

                const commandModule = require(file);

                if (!commandModule.commands || !Array.isArray(commandModule.commands)) {
                    throw new Error(`Invalid command module structure in ${file}`);
                }

                for (const command of commandModule.commands) {
                    // Validate command structure
                    if (!command.name || !command.execute || typeof command.execute !== 'function') {
                        logger.warn(`Invalid command structure in ${file}:`, { command: command.name || 'unnamed' });
                        continue;
                    }

                    this.commands.set(command.name, command);
                    logger.debug(`Loaded command: ${command.name}`, {
                        category: command.category || 'uncategorized',
                        permissions: command.permissions || [],
                        cooldown: command.cooldown || 0
                    });
                    loadedCount++;
                }
            } catch (error) {
                errorCount++;
                logger.error(`Failed to load command file ${file}:`, {
                    error: error.message,
                    stack: error.stack
                });
            }
        }

        logger.info(`Command loading completed`, {
            loaded: loadedCount,
            errors: errorCount,
            total: this.commands.size
        });

        if (errorCount > 0) {
            logger.warn(`${errorCount} command files failed to load`);
        }
    }
    
    /**
     * Handle slash command interaction
     * @param {Object} interaction - Discord interaction
     */
    async handleInteraction(interaction) {
        if (!interaction.isCommand()) return;
        
        const command = this.commands.get(interaction.commandName);
        if (!command) {
            logger.warn(`Unknown command: ${interaction.commandName}`, {
                userId: interaction.user.id,
                guildId: interaction.guild?.id
            });
            return interaction.reply({
                content: '❌ Unknown command.',
                ephemeral: true
            });
        }
        
        try {
            // Check permissions
            if (!this.checkPermissions(interaction, command)) {
                return interaction.reply({
                    content: '❌ You do not have permission to use this command.',
                    ephemeral: true
                });
            }
            
            // Check cooldowns
            if (!this.checkCooldown(interaction, command)) {
                const timeLeft = this.getCooldownTimeLeft(interaction, command);
                return interaction.reply({
                    content: `⏰ Please wait ${utils.formatDuration(timeLeft)} before using this command again.`,
                    ephemeral: true
                });
            }
            
            // Check rate limits
            if (!this.checkRateLimit(interaction)) {
                return interaction.reply({
                    content: '⚠️ You are being rate limited. Please slow down.',
                    ephemeral: true
                });
            }
            
            // Execute command
            const startTime = Date.now();
            await command.execute(interaction);
            const executionTime = Date.now() - startTime;
            
            // Log command execution
            logger.info(`Command executed: ${command.name}`, {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                guildId: interaction.guild?.id,
                guildName: interaction.guild?.name,
                executionTime
            });
            
            // Set cooldown
            this.setCooldown(interaction, command);
            
        } catch (error) {
            logger.error(`Error executing command ${command.name}:`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guild?.id
            });
            
            const errorMessage = '❌ An error occurred while executing this command.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
    
    /**
     * Check if user has required permissions
     * @param {Object} interaction - Discord interaction
     * @param {Object} command - Command object
     * @returns {boolean} - Whether user has permissions
     */
    checkPermissions(interaction, command) {
        if (!command.permissions || command.permissions.length === 0) {
            return true;
        }
        
        if (!interaction.guild) {
            return false; // Guild-only commands require guild context
        }
        
        return utils.hasPermissions(interaction.member, command.permissions);
    }
    
    /**
     * Check command cooldown
     * @param {Object} interaction - Discord interaction
     * @param {Object} command - Command object
     * @returns {boolean} - Whether command is off cooldown
     */
    checkCooldown(interaction, command) {
        if (!command.cooldown) return true;
        
        const cooldownKey = `${interaction.user.id}-${command.name}`;
        const lastUsed = this.cooldowns.get(cooldownKey);
        
        if (!lastUsed) return true;
        
        const timeLeft = (lastUsed + command.cooldown) - Date.now();
        return timeLeft <= 0;
    }
    
    /**
     * Get remaining cooldown time
     * @param {Object} interaction - Discord interaction
     * @param {Object} command - Command object
     * @returns {number} - Remaining cooldown time in milliseconds
     */
    getCooldownTimeLeft(interaction, command) {
        const cooldownKey = `${interaction.user.id}-${command.name}`;
        const lastUsed = this.cooldowns.get(cooldownKey);
        
        if (!lastUsed) return 0;
        
        const timeLeft = (lastUsed + command.cooldown) - Date.now();
        return Math.max(0, timeLeft);
    }
    
    /**
     * Set command cooldown
     * @param {Object} interaction - Discord interaction
     * @param {Object} command - Command object
     */
    setCooldown(interaction, command) {
        if (!command.cooldown) return;
        
        const cooldownKey = `${interaction.user.id}-${command.name}`;
        this.cooldowns.set(cooldownKey, Date.now());
        
        // Clean up old cooldowns
        setTimeout(() => {
            this.cooldowns.delete(cooldownKey);
        }, command.cooldown);
    }
    
    /**
     * Check rate limiting with enhanced logic
     * @param {Object} interaction - Discord interaction
     * @returns {boolean} - Whether user is within rate limits
     */
    checkRateLimit(interaction) {
        const userId = interaction.user.id;
        const commandName = interaction.commandName;
        const now = Date.now();

        // Different limits for different command types
        const limits = {
            moderation: { window: 60000, max: 10 }, // 10 moderation commands per minute
            utility: { window: 30000, max: 20 },    // 20 utility commands per 30 seconds
            admin: { window: 300000, max: 5 },      // 5 admin commands per 5 minutes
            default: { window: 60000, max: 15 }     // 15 commands per minute default
        };

        const command = this.commands.get(commandName);
        const category = command?.category || 'default';
        const limit = limits[category] || limits.default;

        if (!this.rateLimits.has(userId)) {
            this.rateLimits.set(userId, {});
        }

        const userLimits = this.rateLimits.get(userId);

        if (!userLimits[category]) {
            userLimits[category] = [];
        }

        const userCommands = userLimits[category];

        // Remove old entries
        const validCommands = userCommands.filter(timestamp => now - timestamp < limit.window);

        if (validCommands.length >= limit.max) {
            logger.warn('Rate limit exceeded', {
                userId,
                userTag: interaction.user.tag,
                commandName,
                category,
                count: validCommands.length,
                limit: limit.max
            });
            return false;
        }

        // Add current command
        validCommands.push(now);
        userLimits[category] = validCommands;
        this.rateLimits.set(userId, userLimits);

        return true;
    }
    
    /**
     * Get command by name
     * @param {string} name - Command name
     * @returns {Object|null} - Command object or null
     */
    getCommand(name) {
        return this.commands.get(name);
    }
    
    /**
     * Get all commands
     * @returns {Collection} - Collection of commands
     */
    getAllCommands() {
        return this.commands;
    }
    
    /**
     * Get commands by category
     * @param {string} category - Command category
     * @returns {Array} - Array of commands in category
     */
    getCommandsByCategory(category) {
        return this.commands.filter(command => command.category === category);
    }
    
    /**
     * Reload a specific command
     * @param {string} name - Command name
     * @returns {boolean} - Whether reload was successful
     */
    reloadCommand(name) {
        try {
            const command = this.commands.get(name);
            if (!command) return false;
            
            // Clear require cache
            delete require.cache[require.resolve(`./commands/${command.category}.js`)];
            
            // Reload command
            this.loadCommands();
            
            logger.info(`Reloaded command: ${name}`);
            return true;
        } catch (error) {
            logger.error(`Failed to reload command ${name}:`, { error: error.message });
            return false;
        }
    }
    
    /**
     * Get command statistics
     * @returns {Object} - Command statistics
     */
    getStats() {
        const stats = {
            totalCommands: this.commands.size,
            activeCooldowns: this.cooldowns.size,
            activeRateLimits: this.rateLimits.size,
            categories: {}
        };
        
        // Count commands by category
        for (const command of this.commands.values()) {
            const category = command.category || 'uncategorized';
            stats.categories[category] = (stats.categories[category] || 0) + 1;
        }
        
        return stats;
    }
    
    /**
     * Clean up expired data
     */
    cleanup() {
        const now = Date.now();
        let cleanedUsers = 0;
        let cleanedCommands = 0;

        // Clean up rate limits with new structure
        for (const [userId, userLimits] of this.rateLimits.entries()) {
            let hasValidCommands = false;

            for (const [category, commands] of Object.entries(userLimits)) {
                const windowSize = category === 'admin' ? 300000 :
                                category === 'utility' ? 30000 : 60000;

                const validCommands = commands.filter(timestamp => now - timestamp < windowSize);

                if (validCommands.length > 0) {
                    userLimits[category] = validCommands;
                    hasValidCommands = true;
                } else {
                    delete userLimits[category];
                    cleanedCommands++;
                }
            }

            if (!hasValidCommands || Object.keys(userLimits).length === 0) {
                this.rateLimits.delete(userId);
                cleanedUsers++;
            }
        }

        // Clean up old cooldowns
        const cooldownsBefore = this.cooldowns.size;
        this.cooldowns.sweep((timestamp, key) => {
            const commandName = key.split('-')[1];
            const command = this.commands.get(commandName);
            const cooldownTime = command?.cooldown || 5000;
            return now - timestamp > cooldownTime;
        });
        const cooldownsCleaned = cooldownsBefore - this.cooldowns.size;

        logger.debug('Command handler cleanup completed', {
            rateLimitUsersCleaned: cleanedUsers,
            rateLimitCommandsCleaned: cleanedCommands,
            cooldownsCleaned,
            activeRateLimits: this.rateLimits.size,
            activeCooldowns: this.cooldowns.size
        });
    }
}

module.exports = CommandHandler;
