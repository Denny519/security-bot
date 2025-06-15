const { logger } = require('../logger.js');

/**
 * Moderation service for tracking and managing moderation actions
 */
class ModerationService {
    constructor(database) {
        this.db = database;
    }
    
    /**
     * Log moderation action
     */
    async logAction(guildId, userId, moderatorId, actionType, options = {}) {
        try {
            const {
                reason = null,
                duration = null,
                metadata = null
            } = options;
            
            const result = await this.db.run(
                `INSERT INTO moderation_actions 
                (guild_id, user_id, moderator_id, action_type, reason, duration, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [guildId, userId, moderatorId, actionType, reason, duration, 
                 metadata ? JSON.stringify(metadata) : null]
            );
            
            logger.info('Moderation action logged', {
                actionId: result.lastID,
                guildId,
                userId,
                moderatorId,
                actionType,
                reason
            });
            
            return result.lastID;
        } catch (error) {
            logger.error('Failed to log moderation action:', {
                error: error.message,
                guildId,
                userId,
                actionType
            });
            throw error;
        }
    }
    
    /**
     * Get moderation history for user
     */
    async getUserModerationHistory(guildId, userId, limit = 50) {
        try {
            const actions = await this.db.all(
                `SELECT ma.*, uw.reason as warning_reason 
                FROM moderation_actions ma
                LEFT JOIN user_warnings uw ON ma.action_type = 'WARN' AND ma.user_id = uw.user_id
                WHERE ma.guild_id = ? AND ma.user_id = ? 
                ORDER BY ma.created_at DESC LIMIT ?`,
                [guildId, userId, limit]
            );
            
            return actions.map(action => ({
                ...action,
                created_at: new Date(action.created_at),
                metadata: action.metadata ? JSON.parse(action.metadata) : null
            }));
        } catch (error) {
            logger.error('Failed to get user moderation history:', {
                error: error.message,
                guildId,
                userId
            });
            throw error;
        }
    }
    
    /**
     * Get moderation statistics for guild
     */
    async getGuildModerationStats(guildId, timeframe = '30 days') {
        try {
            const timeCondition = this.getTimeCondition(timeframe);
            
            // Get action counts by type
            const actionStats = await this.db.all(
                `SELECT action_type, COUNT(*) as count 
                FROM moderation_actions 
                WHERE guild_id = ? AND created_at >= ${timeCondition}
                GROUP BY action_type 
                ORDER BY count DESC`,
                [guildId]
            );
            
            // Get top moderators
            const moderatorStats = await this.db.all(
                `SELECT moderator_id, COUNT(*) as action_count 
                FROM moderation_actions 
                WHERE guild_id = ? AND created_at >= ${timeCondition} AND moderator_id IS NOT NULL
                GROUP BY moderator_id 
                ORDER BY action_count DESC LIMIT 10`,
                [guildId]
            );
            
            // Get most moderated users
            const userStats = await this.db.all(
                `SELECT user_id, COUNT(*) as action_count 
                FROM moderation_actions 
                WHERE guild_id = ? AND created_at >= ${timeCondition}
                GROUP BY user_id 
                ORDER BY action_count DESC LIMIT 10`,
                [guildId]
            );
            
            // Get daily action counts
            const dailyStats = await this.db.all(
                `SELECT DATE(created_at) as date, COUNT(*) as count 
                FROM moderation_actions 
                WHERE guild_id = ? AND created_at >= ${timeCondition}
                GROUP BY DATE(created_at) 
                ORDER BY date DESC`,
                [guildId]
            );
            
            return {
                timeframe,
                actionStats: actionStats.reduce((acc, stat) => {
                    acc[stat.action_type] = stat.count;
                    return acc;
                }, {}),
                topModerators: moderatorStats,
                mostModeratedUsers: userStats,
                dailyStats,
                totalActions: actionStats.reduce((sum, stat) => sum + stat.count, 0)
            };
        } catch (error) {
            logger.error('Failed to get guild moderation stats:', {
                error: error.message,
                guildId,
                timeframe
            });
            throw error;
        }
    }
    
    /**
     * Get recent moderation actions
     */
    async getRecentActions(guildId, limit = 20) {
        try {
            const actions = await this.db.all(
                `SELECT * FROM moderation_actions 
                WHERE guild_id = ? 
                ORDER BY created_at DESC LIMIT ?`,
                [guildId, limit]
            );
            
            return actions.map(action => ({
                ...action,
                created_at: new Date(action.created_at),
                metadata: action.metadata ? JSON.parse(action.metadata) : null
            }));
        } catch (error) {
            logger.error('Failed to get recent moderation actions:', {
                error: error.message,
                guildId
            });
            throw error;
        }
    }
    
    /**
     * Get moderation trends
     */
    async getModerationTrends(guildId, days = 30) {
        try {
            const trends = await this.db.all(
                `SELECT 
                    DATE(created_at) as date,
                    action_type,
                    COUNT(*) as count
                FROM moderation_actions 
                WHERE guild_id = ? AND created_at >= datetime('now', '-${days} days')
                GROUP BY DATE(created_at), action_type 
                ORDER BY date DESC, action_type`,
                [guildId]
            );
            
            // Process trends data
            const trendData = {};
            const actionTypes = [...new Set(trends.map(t => t.action_type))];
            
            trends.forEach(trend => {
                if (!trendData[trend.date]) {
                    trendData[trend.date] = {};
                    actionTypes.forEach(type => {
                        trendData[trend.date][type] = 0;
                    });
                }
                trendData[trend.date][trend.action_type] = trend.count;
            });
            
            return {
                days,
                actionTypes,
                trends: trendData,
                summary: this.calculateTrendSummary(trendData, actionTypes)
            };
        } catch (error) {
            logger.error('Failed to get moderation trends:', {
                error: error.message,
                guildId,
                days
            });
            throw error;
        }
    }
    
    /**
     * Calculate trend summary
     */
    calculateTrendSummary(trendData, actionTypes) {
        const dates = Object.keys(trendData).sort();
        const summary = {};
        
        actionTypes.forEach(type => {
            const values = dates.map(date => trendData[date][type] || 0);
            const total = values.reduce((sum, val) => sum + val, 0);
            const average = total / values.length;
            
            // Calculate trend direction
            const recentValues = values.slice(-7); // Last 7 days
            const olderValues = values.slice(-14, -7); // Previous 7 days
            
            const recentAvg = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
            const olderAvg = olderValues.reduce((sum, val) => sum + val, 0) / olderValues.length;
            
            let trend = 'stable';
            if (recentAvg > olderAvg * 1.2) trend = 'increasing';
            else if (recentAvg < olderAvg * 0.8) trend = 'decreasing';
            
            summary[type] = {
                total,
                average: Math.round(average * 100) / 100,
                trend,
                recentAverage: Math.round(recentAvg * 100) / 100,
                changePercent: olderAvg > 0 ? Math.round(((recentAvg - olderAvg) / olderAvg) * 100) : 0
            };
        });
        
        return summary;
    }
    
    /**
     * Get time condition for SQL queries
     */
    getTimeCondition(timeframe) {
        switch (timeframe) {
            case '24 hours':
                return "datetime('now', '-1 day')";
            case '7 days':
                return "datetime('now', '-7 days')";
            case '30 days':
                return "datetime('now', '-30 days')";
            case '90 days':
                return "datetime('now', '-90 days')";
            case '1 year':
                return "datetime('now', '-1 year')";
            default:
                return "datetime('now', '-30 days')";
        }
    }
    
    /**
     * Generate moderation report
     */
    async generateReport(guildId, timeframe = '30 days') {
        try {
            const [stats, trends, recentActions] = await Promise.all([
                this.getGuildModerationStats(guildId, timeframe),
                this.getModerationTrends(guildId, 30),
                this.getRecentActions(guildId, 10)
            ]);
            
            // Calculate efficiency metrics
            const efficiency = this.calculateEfficiencyMetrics(stats, trends);
            
            return {
                guildId,
                timeframe,
                generatedAt: new Date(),
                statistics: stats,
                trends,
                recentActions,
                efficiency,
                recommendations: this.generateRecommendations(stats, trends, efficiency)
            };
        } catch (error) {
            logger.error('Failed to generate moderation report:', {
                error: error.message,
                guildId,
                timeframe
            });
            throw error;
        }
    }
    
    /**
     * Calculate efficiency metrics
     */
    calculateEfficiencyMetrics(stats, trends) {
        const totalActions = stats.totalActions;
        const actionTypes = Object.keys(stats.actionStats);
        
        // Calculate action distribution
        const distribution = {};
        actionTypes.forEach(type => {
            distribution[type] = {
                count: stats.actionStats[type],
                percentage: Math.round((stats.actionStats[type] / totalActions) * 100)
            };
        });
        
        // Calculate severity score (higher = more severe actions)
        const severityWeights = {
            'WARN': 1,
            'TIMEOUT': 2,
            'KICK': 3,
            'BAN': 4,
            'AUTO_KICK': 3,
            'AUTO_BAN': 4
        };
        
        let severityScore = 0;
        actionTypes.forEach(type => {
            const weight = severityWeights[type] || 1;
            severityScore += stats.actionStats[type] * weight;
        });
        
        const averageSeverity = totalActions > 0 ? severityScore / totalActions : 0;
        
        return {
            totalActions,
            distribution,
            averageSeverity: Math.round(averageSeverity * 100) / 100,
            moderatorCount: stats.topModerators.length,
            averageActionsPerModerator: stats.topModerators.length > 0 
                ? Math.round(totalActions / stats.topModerators.length * 100) / 100 
                : 0
        };
    }
    
    /**
     * Generate recommendations based on moderation data
     */
    generateRecommendations(stats, trends, efficiency) {
        const recommendations = [];
        
        // High ban rate recommendation
        const banPercentage = efficiency.distribution.BAN?.percentage || 0;
        if (banPercentage > 20) {
            recommendations.push({
                type: 'warning',
                title: 'High Ban Rate',
                description: `${banPercentage}% of actions are bans. Consider implementing more warnings or timeouts first.`,
                priority: 'high'
            });
        }
        
        // Low warning usage
        const warnPercentage = efficiency.distribution.WARN?.percentage || 0;
        if (warnPercentage < 30 && efficiency.totalActions > 10) {
            recommendations.push({
                type: 'suggestion',
                title: 'Increase Warning Usage',
                description: 'Consider using more warnings before escalating to kicks/bans.',
                priority: 'medium'
            });
        }
        
        // Trend-based recommendations
        Object.entries(trends.summary).forEach(([actionType, summary]) => {
            if (summary.trend === 'increasing' && summary.changePercent > 50) {
                recommendations.push({
                    type: 'alert',
                    title: `Increasing ${actionType} Actions`,
                    description: `${actionType} actions have increased by ${summary.changePercent}% recently.`,
                    priority: 'high'
                });
            }
        });
        
        return recommendations;
    }
}

module.exports = ModerationService;
