const fs = require('fs');
const path = require('path');
const { logger } = require('../logger.js');

/**
 * Advanced configuration management system
 * Supports per-guild configurations, validation, and persistence
 */
class ConfigManager {
    constructor(options = {}) {
        this.configDir = options.configDir || './configs';
        this.defaultConfig = options.defaultConfig || require('../config.js');
        this.guildConfigs = new Map(); // guildId -> config
        this.configSchema = this.createConfigSchema();
        this.autoSave = options.autoSave !== false;
        this.saveInterval = options.saveInterval || 30000; // 30 seconds
        
        // Ensure config directory exists
        this.ensureConfigDirectory();
        
        // Load existing configurations
        this.loadAllConfigs();
        
        // Start auto-save if enabled
        if (this.autoSave) {
            this.startAutoSave();
        }
    }
    
    /**
     * Create configuration schema for validation
     */
    createConfigSchema() {
        return {
            spam: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    maxMessagesPerMinute: { type: 'number', min: 1, max: 100 },
                    maxDuplicateMessages: { type: 'number', min: 1, max: 10 },
                    timeWindow: { type: 'number', min: 1000, max: 300000 },
                    cooldown: { type: 'number', min: 1000, max: 60000 }
                }
            },
            links: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    whitelist: { type: 'array', items: { type: 'string' } },
                    allowShorteners: { type: 'boolean' },
                    checkSuspicious: { type: 'boolean' }
                }
            },
            mentions: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    maxMentions: { type: 'number', min: 1, max: 50 },
                    excludeBotMentions: { type: 'boolean' },
                    allowRoleMentions: { type: 'boolean' }
                }
            },
            raidProtection: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    joinThreshold: { type: 'number', min: 3, max: 100 },
                    timeWindow: { type: 'number', min: 10000, max: 600000 }, // 10 seconds to 10 minutes
                    actions: {
                        type: 'object',
                        properties: {
                            lockdown: { type: 'boolean' },
                            kickNewMembers: { type: 'boolean' },
                            requireVerification: { type: 'boolean' },
                            notifyModerators: { type: 'boolean' }
                        }
                    },
                    accountAge: {
                        type: 'object',
                        properties: {
                            enabled: { type: 'boolean' },
                            minimumAge: { type: 'number', min: 600000, max: 2592000000 }, // 10 minutes to 30 days
                            action: { type: 'string', enum: ['warn', 'kick', 'ban'] }
                        }
                    }
                }
            },
            moderation: {
                type: 'object',
                properties: {
                    warnBeforeKick: { type: 'boolean' },
                    kickReason: { type: 'string', maxLength: 512 },
                    banReason: { type: 'string', maxLength: 512 },
                    logChannel: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' }, // Discord snowflake or null
                    autoModeration: { type: 'boolean' },
                    maxWarnings: { type: 'number', min: 1, max: 10 }
                }
            },
            logging: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    level: { type: 'string', enum: ['error', 'warn', 'info', 'debug', 'trace'] },
                    discordLogging: { type: 'boolean' },
                    channels: {
                        type: 'object',
                        properties: {
                            general: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' },
                            moderation: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' },
                            security: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' },
                            errors: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' },
                            joins: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' },
                            messages: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' },
                            voice: { type: ['string', 'null'], pattern: '^(\\d{17,19}|null)$' }
                        }
                    },
                    events: {
                        type: 'object',
                        properties: {
                            messageDelete: { type: 'boolean' },
                            messageEdit: { type: 'boolean' },
                            memberJoin: { type: 'boolean' },
                            memberLeave: { type: 'boolean' },
                            memberBan: { type: 'boolean' },
                            memberUnban: { type: 'boolean' },
                            memberKick: { type: 'boolean' },
                            memberTimeout: { type: 'boolean' },
                            roleCreate: { type: 'boolean' },
                            roleDelete: { type: 'boolean' },
                            roleUpdate: { type: 'boolean' },
                            channelCreate: { type: 'boolean' },
                            channelDelete: { type: 'boolean' },
                            channelUpdate: { type: 'boolean' },
                            voiceStateUpdate: { type: 'boolean' }
                        }
                    }
                }
            }
        };
    }
    
    /**
     * Ensure config directory exists
     */
    ensureConfigDirectory() {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
            logger.info('Created config directory', { path: this.configDir });
        }
    }
    
    /**
     * Load all guild configurations
     */
    loadAllConfigs() {
        try {
            if (!fs.existsSync(this.configDir)) return;
            
            const files = fs.readdirSync(this.configDir);
            const configFiles = files.filter(file => file.endsWith('.json'));
            
            for (const file of configFiles) {
                const guildId = path.basename(file, '.json');
                this.loadGuildConfig(guildId);
            }
            
            logger.info('Loaded guild configurations', { 
                count: this.guildConfigs.size,
                guilds: Array.from(this.guildConfigs.keys())
            });
            
        } catch (error) {
            logger.error('Failed to load configurations', { error: error.message });
        }
    }
    
    /**
     * Load configuration for specific guild
     */
    loadGuildConfig(guildId) {
        try {
            const configPath = path.join(this.configDir, `${guildId}.json`);
            
            if (!fs.existsSync(configPath)) {
                // Create default config for new guild
                const defaultConfig = this.createDefaultGuildConfig();
                this.guildConfigs.set(guildId, defaultConfig);
                this.saveGuildConfig(guildId);
                return defaultConfig;
            }
            
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            // Validate configuration
            const validation = this.validateConfig(config);
            if (!validation.isValid) {
                logger.warn('Invalid guild configuration, using defaults', {
                    guildId,
                    errors: validation.errors
                });
                const defaultConfig = this.createDefaultGuildConfig();
                this.guildConfigs.set(guildId, defaultConfig);
                return defaultConfig;
            }
            
            // Merge with defaults to ensure all properties exist
            const mergedConfig = this.mergeWithDefaults(config);
            this.guildConfigs.set(guildId, mergedConfig);
            
            logger.debug('Loaded guild configuration', { guildId });
            return mergedConfig;
            
        } catch (error) {
            logger.error('Failed to load guild configuration', {
                guildId,
                error: error.message
            });
            
            // Return default config on error
            const defaultConfig = this.createDefaultGuildConfig();
            this.guildConfigs.set(guildId, defaultConfig);
            return defaultConfig;
        }
    }
    
    /**
     * Save configuration for specific guild
     */
    saveGuildConfig(guildId) {
        try {
            const config = this.guildConfigs.get(guildId);
            if (!config) return false;
            
            const configPath = path.join(this.configDir, `${guildId}.json`);
            const configData = JSON.stringify(config, null, 2);
            
            fs.writeFileSync(configPath, configData, 'utf8');
            
            logger.debug('Saved guild configuration', { guildId });
            return true;
            
        } catch (error) {
            logger.error('Failed to save guild configuration', {
                guildId,
                error: error.message
            });
            return false;
        }
    }
    
    /**
     * Save all guild configurations
     */
    saveAllConfigs() {
        let savedCount = 0;
        let errorCount = 0;
        
        for (const guildId of this.guildConfigs.keys()) {
            if (this.saveGuildConfig(guildId)) {
                savedCount++;
            } else {
                errorCount++;
            }
        }
        
        logger.info('Saved all guild configurations', {
            saved: savedCount,
            errors: errorCount,
            total: this.guildConfigs.size
        });
        
        return { saved: savedCount, errors: errorCount };
    }
    
    /**
     * Get configuration for guild
     */
    getGuildConfig(guildId) {
        if (!this.guildConfigs.has(guildId)) {
            return this.loadGuildConfig(guildId);
        }
        
        return this.guildConfigs.get(guildId);
    }
    
    /**
     * Update configuration for guild
     */
    updateGuildConfig(guildId, updates) {
        try {
            const currentConfig = this.getGuildConfig(guildId);
            const updatedConfig = this.deepMerge(currentConfig, updates);
            
            // Validate updated configuration
            const validation = this.validateConfig(updatedConfig);
            if (!validation.isValid) {
                return {
                    success: false,
                    errors: validation.errors
                };
            }
            
            this.guildConfigs.set(guildId, updatedConfig);
            
            if (this.autoSave) {
                this.saveGuildConfig(guildId);
            }
            
            logger.info('Updated guild configuration', {
                guildId,
                updates: Object.keys(updates)
            });
            
            return {
                success: true,
                config: updatedConfig
            };
            
        } catch (error) {
            logger.error('Failed to update guild configuration', {
                guildId,
                error: error.message
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Reset guild configuration to defaults
     */
    resetGuildConfig(guildId) {
        const defaultConfig = this.createDefaultGuildConfig();
        this.guildConfigs.set(guildId, defaultConfig);
        
        if (this.autoSave) {
            this.saveGuildConfig(guildId);
        }
        
        logger.info('Reset guild configuration to defaults', { guildId });
        return defaultConfig;
    }
    
    /**
     * Create default guild configuration
     */
    createDefaultGuildConfig() {
        return JSON.parse(JSON.stringify(this.defaultConfig));
    }
    
    /**
     * Validate configuration against schema
     */
    validateConfig(config) {
        const result = {
            isValid: true,
            errors: []
        };
        
        try {
            // Basic validation - check required properties and types
            for (const [section, schema] of Object.entries(this.configSchema)) {
                if (!config[section]) {
                    result.errors.push(`Missing section: ${section}`);
                    continue;
                }
                
                const sectionValidation = this.validateSection(config[section], schema, section);
                if (!sectionValidation.isValid) {
                    result.errors.push(...sectionValidation.errors);
                }
            }
            
            result.isValid = result.errors.length === 0;
            
        } catch (error) {
            result.isValid = false;
            result.errors.push(`Validation error: ${error.message}`);
        }
        
        return result;
    }
    
    /**
     * Validate configuration section
     */
    validateSection(data, schema, sectionName) {
        const result = {
            isValid: true,
            errors: []
        };
        
        if (schema.type === 'object' && schema.properties) {
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
                if (data[prop] === undefined) continue;
                
                const propValidation = this.validateProperty(data[prop], propSchema, `${sectionName}.${prop}`);
                if (!propValidation.isValid) {
                    result.errors.push(...propValidation.errors);
                }
            }
        }
        
        result.isValid = result.errors.length === 0;
        return result;
    }
    
    /**
     * Validate individual property
     */
    validateProperty(value, schema, propertyPath) {
        const result = {
            isValid: true,
            errors: []
        };

        // Handle null values
        if (value === null) {
            if (schema.type && Array.isArray(schema.type)) {
                // Check if null is allowed in type array
                if (!schema.type.includes('null')) {
                    result.errors.push(`${propertyPath}: null is not allowed`);
                    result.isValid = false;
                }
            } else if (schema.type && schema.type !== 'null') {
                // Single type that's not null
                result.errors.push(`${propertyPath}: Expected ${schema.type}, got null`);
                result.isValid = false;
            }
            return result; // Skip other validations for null values
        }

        // Type validation
        if (schema.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            let typeMatches = false;

            if (Array.isArray(schema.type)) {
                // Multiple allowed types
                typeMatches = schema.type.includes(actualType);
            } else {
                // Single type
                typeMatches = actualType === schema.type;
            }

            if (!typeMatches) {
                const expectedTypes = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
                result.errors.push(`${propertyPath}: Expected ${expectedTypes}, got ${actualType}`);
                result.isValid = false;
                return result;
            }
        }

        // Number validations
        if (typeof value === 'number') {
            if (schema.min !== undefined && value < schema.min) {
                result.errors.push(`${propertyPath}: Value ${value} is below minimum ${schema.min}`);
            }
            if (schema.max !== undefined && value > schema.max) {
                result.errors.push(`${propertyPath}: Value ${value} is above maximum ${schema.max}`);
            }
        }

        // String validations
        if (typeof value === 'string') {
            if (schema.maxLength !== undefined && value.length > schema.maxLength) {
                result.errors.push(`${propertyPath}: String length ${value.length} exceeds maximum ${schema.maxLength}`);
            }
            if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
                result.errors.push(`${propertyPath}: String does not match required pattern`);
            }
            if (schema.enum && !schema.enum.includes(value)) {
                result.errors.push(`${propertyPath}: Value "${value}" is not in allowed values: ${schema.enum.join(', ')}`);
            }
        }

        result.isValid = result.errors.length === 0;
        return result;
    }
    
    /**
     * Deep merge two objects
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
    
    /**
     * Merge configuration with defaults
     */
    mergeWithDefaults(config) {
        return this.deepMerge(this.defaultConfig, config);
    }
    
    /**
     * Start auto-save interval
     */
    startAutoSave() {
        setInterval(() => {
            this.saveAllConfigs();
        }, this.saveInterval);
        
        logger.debug('Started auto-save for configurations', {
            interval: this.saveInterval
        });
    }
    
    /**
     * Export guild configuration
     */
    exportGuildConfig(guildId) {
        const config = this.getGuildConfig(guildId);
        return {
            guildId,
            exportedAt: new Date().toISOString(),
            version: '2.1.0',
            config
        };
    }
    
    /**
     * Import guild configuration
     */
    importGuildConfig(guildId, importData) {
        try {
            if (!importData.config) {
                throw new Error('Invalid import data: missing config');
            }
            
            const validation = this.validateConfig(importData.config);
            if (!validation.isValid) {
                return {
                    success: false,
                    errors: validation.errors
                };
            }
            
            this.guildConfigs.set(guildId, importData.config);
            
            if (this.autoSave) {
                this.saveGuildConfig(guildId);
            }
            
            logger.info('Imported guild configuration', {
                guildId,
                version: importData.version,
                importedAt: importData.exportedAt
            });
            
            return {
                success: true,
                config: importData.config
            };
            
        } catch (error) {
            logger.error('Failed to import guild configuration', {
                guildId,
                error: error.message
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get configuration statistics
     */
    getStats() {
        const stats = {
            totalGuilds: this.guildConfigs.size,
            configDirectory: this.configDir,
            autoSave: this.autoSave,
            saveInterval: this.saveInterval
        };
        
        // Count configurations by feature usage
        const featureUsage = {
            spam: 0,
            links: 0,
            mentions: 0,
            raidProtection: 0,
            discordLogging: 0
        };
        
        for (const config of this.guildConfigs.values()) {
            if (config.spam?.enabled) featureUsage.spam++;
            if (config.links?.enabled) featureUsage.links++;
            if (config.mentions?.enabled) featureUsage.mentions++;
            if (config.raidProtection?.enabled) featureUsage.raidProtection++;
            if (config.logging?.discordLogging) featureUsage.discordLogging++;
        }
        
        stats.featureUsage = featureUsage;
        
        return stats;
    }
}

module.exports = ConfigManager;
