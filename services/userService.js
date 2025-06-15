const { logger } = require('../logger.js');

/**
 * User service for managing user-related database operations
 */
class UserService {
    constructor(database) {
        this.db = database;
    }
    
    /**
     * Add warning to user
     */
    async addWarning(guildId, userId, moderatorId, reason, options = {}) {
        try {
            const {
                warningType = 'manual',
                severity = 1,
                expiresAt = null
            } = options;
            
            const result = await this.db.run(
                `INSERT INTO user_warnings 
                (guild_id, user_id, moderator_id, reason, warning_type, severity, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [guildId, userId, moderatorId, reason, warningType, severity, expiresAt]
            );
            
            logger.info('Warning added to user', {
                warningId: result.lastID,
                guildId,
                userId,
                moderatorId,
                reason,
                severity
            });
            
            return result.lastID;
        } catch (error) {
            logger.error('Failed to add warning:', {
                error: error.message,
                guildId,
                userId,
                moderatorId
            });
            throw error;
        }
    }
    
    /**
     * Get user warnings
     */
    async getUserWarnings(guildId, userId, activeOnly = true) {
        try {
            let sql = `
                SELECT * FROM user_warnings 
                WHERE guild_id = ? AND user_id = ?
            `;
            const params = [guildId, userId];
            
            if (activeOnly) {
                sql += ` AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`;
            }
            
            sql += ` ORDER BY created_at DESC`;
            
            const warnings = await this.db.all(sql, params);
            
            return warnings.map(warning => ({
                ...warning,
                created_at: warning.created_at ? new Date(warning.created_at) : new Date(),
                expires_at: warning.expires_at ? new Date(warning.expires_at) : null
            }));
        } catch (error) {
            logger.error('Failed to get user warnings:', {
                error: error.message,
                guildId,
                userId
            });
            throw error;
        }
    }
    
    /**
     * Get warning count for user
     */
    async getWarningCount(guildId, userId, activeOnly = true) {
        try {
            let sql = `
                SELECT COUNT(*) as count FROM user_warnings 
                WHERE guild_id = ? AND user_id = ?
            `;
            const params = [guildId, userId];
            
            if (activeOnly) {
                sql += ` AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`;
            }
            
            const result = await this.db.get(sql, params);
            return result.count;
        } catch (error) {
            logger.error('Failed to get warning count:', {
                error: error.message,
                guildId,
                userId
            });
            return 0;
        }
    }
    
    /**
     * Remove/deactivate warning
     */
    async removeWarning(warningId, moderatorId) {
        try {
            const result = await this.db.run(
                `UPDATE user_warnings SET is_active = 0 WHERE id = ?`,
                [warningId]
            );
            
            if (result.changes > 0) {
                logger.info('Warning removed', {
                    warningId,
                    moderatorId
                });
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error('Failed to remove warning:', {
                error: error.message,
                warningId,
                moderatorId
            });
            throw error;
        }
    }
    
    /**
     * Add violation record
     */
    async addViolation(guildId, userId, violationType, options = {}) {
        try {
            const {
                severity = 1,
                autoDetected = false,
                messageContent = null,
                metadata = null
            } = options;
            
            const result = await this.db.run(
                `INSERT INTO user_violations 
                (guild_id, user_id, violation_type, severity, auto_detected, message_content, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [guildId, userId, violationType, severity, autoDetected ? 1 : 0, messageContent, 
                 metadata ? JSON.stringify(metadata) : null]
            );
            
            logger.info('Violation recorded', {
                violationId: result.lastID,
                guildId,
                userId,
                violationType,
                severity,
                autoDetected
            });
            
            return result.lastID;
        } catch (error) {
            logger.error('Failed to add violation:', {
                error: error.message,
                guildId,
                userId,
                violationType
            });
            throw error;
        }
    }
    
    /**
     * Get user violations
     */
    async getUserViolations(guildId, userId, limit = 50) {
        try {
            const violations = await this.db.all(
                `SELECT * FROM user_violations 
                WHERE guild_id = ? AND user_id = ? 
                ORDER BY created_at DESC LIMIT ?`,
                [guildId, userId, limit]
            );
            
            return violations.map(violation => ({
                ...violation,
                created_at: new Date(violation.created_at),
                metadata: violation.metadata ? JSON.parse(violation.metadata) : null,
                auto_detected: Boolean(violation.auto_detected)
            }));
        } catch (error) {
            logger.error('Failed to get user violations:', {
                error: error.message,
                guildId,
                userId
            });
            throw error;
        }
    }
    
    /**
     * Get user reputation
     */
    async getUserReputation(guildId, userId) {
        try {
            const reputation = await this.db.get(
                `SELECT * FROM user_reputation WHERE guild_id = ? AND user_id = ?`,
                [guildId, userId]
            );
            
            if (!reputation) {
                // Create initial reputation record
                await this.db.run(
                    `INSERT INTO user_reputation (guild_id, user_id) VALUES (?, ?)`,
                    [guildId, userId]
                );
                
                return {
                    guild_id: guildId,
                    user_id: userId,
                    reputation_score: 0,
                    positive_actions: 0,
                    negative_actions: 0,
                    last_updated: new Date()
                };
            }
            
            return {
                ...reputation,
                last_updated: new Date(reputation.last_updated)
            };
        } catch (error) {
            logger.error('Failed to get user reputation:', {
                error: error.message,
                guildId,
                userId
            });
            throw error;
        }
    }
    
    /**
     * Update user reputation
     */
    async updateReputation(guildId, userId, change, isPositive = true) {
        try {
            const current = await this.getUserReputation(guildId, userId);
            
            const newScore = current.reputation_score + (isPositive ? change : -change);
            const positiveActions = current.positive_actions + (isPositive ? 1 : 0);
            const negativeActions = current.negative_actions + (isPositive ? 0 : 1);
            
            await this.db.run(
                `UPDATE user_reputation 
                SET reputation_score = ?, positive_actions = ?, negative_actions = ?, 
                    last_updated = datetime('now')
                WHERE guild_id = ? AND user_id = ?`,
                [newScore, positiveActions, negativeActions, guildId, userId]
            );
            
            logger.info('User reputation updated', {
                guildId,
                userId,
                oldScore: current.reputation_score,
                newScore,
                change,
                isPositive
            });
            
            return newScore;
        } catch (error) {
            logger.error('Failed to update user reputation:', {
                error: error.message,
                guildId,
                userId,
                change,
                isPositive
            });
            throw error;
        }
    }
    
    /**
     * Get user statistics
     */
    async getUserStats(guildId, userId) {
        try {
            const [warnings, violations, reputation] = await Promise.all([
                this.getWarningCount(guildId, userId),
                this.getUserViolations(guildId, userId, 10),
                this.getUserReputation(guildId, userId)
            ]);
            
            // Get recent moderation actions
            const moderationActions = await this.db.all(
                `SELECT * FROM moderation_actions 
                WHERE guild_id = ? AND user_id = ? 
                ORDER BY created_at DESC LIMIT 10`,
                [guildId, userId]
            );
            
            return {
                warnings: {
                    total: warnings,
                    active: warnings
                },
                violations: {
                    total: violations.length,
                    recent: violations.slice(0, 5)
                },
                reputation: reputation,
                moderationActions: moderationActions.map(action => ({
                    ...action,
                    created_at: new Date(action.created_at),
                    metadata: action.metadata ? JSON.parse(action.metadata) : null
                })),
                riskLevel: this.calculateRiskLevel(warnings, violations.length, reputation.reputation_score)
            };
        } catch (error) {
            logger.error('Failed to get user stats:', {
                error: error.message,
                guildId,
                userId
            });
            throw error;
        }
    }
    
    /**
     * Calculate user risk level
     */
    calculateRiskLevel(warningCount, violationCount, reputationScore) {
        let riskScore = 0;
        
        // Factor in warnings (each warning adds 10 points)
        riskScore += warningCount * 10;
        
        // Factor in violations (each violation adds 5 points)
        riskScore += violationCount * 5;
        
        // Factor in reputation (negative reputation adds to risk)
        if (reputationScore < 0) {
            riskScore += Math.abs(reputationScore);
        } else if (reputationScore > 50) {
            riskScore -= 10; // Good reputation reduces risk
        }
        
        if (riskScore >= 50) return 'critical';
        if (riskScore >= 30) return 'high';
        if (riskScore >= 15) return 'medium';
        return 'low';
    }
    
    /**
     * Clean up expired warnings
     */
    async cleanupExpiredWarnings() {
        try {
            const result = await this.db.run(
                `UPDATE user_warnings 
                SET is_active = 0 
                WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at <= datetime('now')`
            );
            
            if (result.changes > 0) {
                logger.info('Expired warnings cleaned up', {
                    count: result.changes
                });
            }
            
            return result.changes;
        } catch (error) {
            logger.error('Failed to cleanup expired warnings:', {
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = UserService;
