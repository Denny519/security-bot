const { PermissionsBitField, EmbedBuilder } = require('discord.js');

/**
 * Utility functions for the Security Bot
 */

/**
 * Log an action with timestamp and details
 * @param {string} action - The action performed
 * @param {Object} user - The user object
 * @param {string} reason - The reason for the action
 * @param {Object} guild - The guild object
 * @param {Object} moderator - The moderator who performed the action
 */
function logAction(action, user, reason, guild, moderator = null) {
    const timestamp = new Date().toISOString();
    const modInfo = moderator ? ` by ${moderator.tag} (${moderator.id})` : ' (Automated)';
    console.log(`[${timestamp}] ${action}: ${user.tag} (${user.id}) in ${guild.name}${modInfo} - Reason: ${reason}`);
}

/**
 * Check if a link is whitelisted
 * @param {string} content - The message content
 * @param {Array} whitelist - Array of whitelisted domains
 * @returns {boolean} - True if link is whitelisted
 */
function isWhitelistedLink(content, whitelist) {
    if (!whitelist || whitelist.length === 0) return false;
    return whitelist.some(domain => content.includes(domain));
}

/**
 * Extract URLs from text
 * @param {string} text - The text to extract URLs from
 * @returns {Array} - Array of URLs found
 */
function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

/**
 * Check if a URL is a known URL shortener
 * @param {string} url - The URL to check
 * @returns {boolean} - True if it's a URL shortener
 */
function isUrlShortener(url) {
    const shorteners = [
        'bit.ly', 'tinyurl.com', 'short.link', 't.co', 'goo.gl',
        'ow.ly', 'is.gd', 'buff.ly', 'adf.ly', 'bl.ink'
    ];
    return shorteners.some(shortener => url.includes(shortener));
}

/**
 * Calculate text similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity ratio (0-1)
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
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
    
    return matrix[str2.length][str1.length];
}

/**
 * Check if text contains excessive repeated characters
 * @param {string} text - The text to check
 * @param {number} maxRepeated - Maximum allowed repeated characters
 * @returns {boolean} - True if excessive repetition found
 */
function hasExcessiveRepeatedChars(text, maxRepeated = 5) {
    const regex = new RegExp(`(.)\\1{${maxRepeated},}`, 'i');
    return regex.test(text);
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Create a standardized embed for moderation actions
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @param {string} color - Embed color (hex)
 * @param {Object} fields - Additional fields
 * @returns {EmbedBuilder} - Discord embed
 */
function createModerationEmbed(title, description, color = '#ff0000', fields = []) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
    
    if (fields.length > 0) {
        embed.addFields(fields);
    }
    
    return embed;
}

/**
 * Check if user has required permissions
 * @param {Object} member - Guild member object
 * @param {Array} permissions - Array of permission strings
 * @returns {boolean} - True if user has all permissions
 */
function hasPermissions(member, permissions) {
    if (!member || !permissions) return false;
    
    const permissionFlags = permissions.map(perm => PermissionsBitField.Flags[perm]);
    return member.permissions.has(permissionFlags);
}

/**
 * Sanitize text for logging (remove sensitive information)
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
    // Remove potential tokens, passwords, etc.
    return text
        .replace(/[A-Za-z0-9]{24}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27}/g, '[TOKEN_REMOVED]')
        .replace(/password[:\s]*[^\s]+/gi, 'password: [REDACTED]')
        .replace(/token[:\s]*[^\s]+/gi, 'token: [REDACTED]')
        .replace(/key[:\s]*[^\s]+/gi, 'key: [REDACTED]');
}

/**
 * Generate a random string for IDs
 * @param {number} length - Length of the string
 * @returns {string} - Random string
 */
function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Validate Discord snowflake ID
 * @param {string} id - The ID to validate
 * @returns {boolean} - True if valid snowflake
 */
function isValidSnowflake(id) {
    return /^\d{17,19}$/.test(id);
}

/**
 * Get user mention from ID
 * @param {string} userId - User ID
 * @returns {string} - User mention string
 */
function getUserMention(userId) {
    return `<@${userId}>`;
}

/**
 * Get channel mention from ID
 * @param {string} channelId - Channel ID
 * @returns {string} - Channel mention string
 */
function getChannelMention(channelId) {
    return `<#${channelId}>`;
}

/**
 * Get role mention from ID
 * @param {string} roleId - Role ID
 * @returns {string} - Role mention string
 */
function getRoleMention(roleId) {
    return `<@&${roleId}>`;
}

/**
 * Escape Discord markdown
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeMarkdown(text) {
    return text.replace(/([*_`~\\])/g, '\\$1');
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Create a simple hash of a string for caching purposes
 * @param {string} str - String to hash
 * @returns {string} - Hash string
 */
function hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString();
}

/**
 * Check if account is new (created recently)
 * @param {Object} user - Discord user object
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {boolean} - True if account is new
 */
function isNewAccount(user, maxAge = 604800000) { // 7 days default
    if (!user || !user.createdTimestamp) return false;
    const accountAge = Date.now() - user.createdTimestamp;
    return accountAge < maxAge;
}

/**
 * Validate and sanitize user input
 * @param {string} input - User input to validate
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
function validateInput(input, options = {}) {
    const {
        maxLength = 2000,
        minLength = 1,
        allowEmpty = false,
        stripHtml = true,
        allowedChars = null,
        blockedWords = []
    } = options;

    const result = {
        isValid: true,
        sanitized: input,
        errors: []
    };

    // Check if input exists
    if (!input || typeof input !== 'string') {
        if (!allowEmpty) {
            result.isValid = false;
            result.errors.push('Input is required');
        }
        return result;
    }

    // Check length
    if (input.length < minLength) {
        result.isValid = false;
        result.errors.push(`Input must be at least ${minLength} characters`);
    }

    if (input.length > maxLength) {
        result.isValid = false;
        result.errors.push(`Input must be no more than ${maxLength} characters`);
        result.sanitized = input.substring(0, maxLength);
    }

    // Strip HTML if requested
    if (stripHtml) {
        result.sanitized = result.sanitized.replace(/<[^>]*>/g, '');
    }

    // Check allowed characters
    if (allowedChars && !new RegExp(`^[${allowedChars}]*$`).test(result.sanitized)) {
        result.isValid = false;
        result.errors.push('Input contains invalid characters');
    }

    // Check for blocked words
    const lowerInput = result.sanitized.toLowerCase();
    for (const word of blockedWords) {
        if (lowerInput.includes(word.toLowerCase())) {
            result.isValid = false;
            result.errors.push('Input contains blocked content');
            break;
        }
    }

    return result;
}

/**
 * Validate Discord snowflake ID with enhanced checks
 * @param {string} id - The ID to validate
 * @param {string} type - Type of ID (user, guild, channel, etc.)
 * @returns {Object} - Validation result
 */
function validateSnowflake(id, type = 'unknown') {
    const result = {
        isValid: false,
        errors: []
    };

    if (!id || typeof id !== 'string') {
        result.errors.push(`${type} ID is required`);
        return result;
    }

    // Check format
    if (!/^\d{17,19}$/.test(id)) {
        result.errors.push(`Invalid ${type} ID format`);
        return result;
    }

    // Check if it's a valid timestamp (Discord epoch started 2015-01-01)
    const timestamp = (BigInt(id) >> 22n) + 1420070400000n;
    const date = new Date(Number(timestamp));

    if (date.getFullYear() < 2015 || date > new Date()) {
        result.errors.push(`${type} ID timestamp is invalid`);
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Rate limit checker for user actions
 * @param {string} userId - User ID
 * @param {string} action - Action type
 * @param {number} limit - Max actions per window
 * @param {number} window - Time window in milliseconds
 * @param {Map} cache - Cache to store rate limit data
 * @returns {boolean} - Whether action is allowed
 */
function checkActionRateLimit(userId, action, limit = 5, window = 60000, cache = new Map()) {
    const key = `${userId}-${action}`;
    const now = Date.now();

    if (!cache.has(key)) {
        cache.set(key, []);
    }

    const actions = cache.get(key);

    // Remove old actions
    const validActions = actions.filter(timestamp => now - timestamp < window);

    if (validActions.length >= limit) {
        return false;
    }

    validActions.push(now);
    cache.set(key, validActions);

    return true;
}

module.exports = {
    logAction,
    isWhitelistedLink,
    extractUrls,
    isUrlShortener,
    calculateSimilarity,
    levenshteinDistance,
    hasExcessiveRepeatedChars,
    formatDuration,
    createModerationEmbed,
    hasPermissions,
    sanitizeText,
    generateId,
    isValidSnowflake,
    getUserMention,
    getChannelMention,
    getRoleMention,
    escapeMarkdown,
    truncateText,
    hashString,
    isNewAccount,
    validateInput,
    validateSnowflake,
    checkActionRateLimit
};
