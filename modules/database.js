const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { logger } = require('../logger.js');

/**
 * Database management system for the Security Bot
 * Handles SQLite database operations for persistent storage
 */
class DatabaseManager {
    constructor(options = {}) {
        this.dbPath = options.dbPath || './data/security-bot.db';
        this.backupPath = options.backupPath || './data/backups';
        this.db = null;
        this.isConnected = false;
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;
        
        // Ensure data directory exists
        this.ensureDataDirectory();
    }
    
    /**
     * Ensure data directory exists
     */
    ensureDataDirectory() {
        const dataDir = path.dirname(this.dbPath);
        const backupDir = this.backupPath;
        
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.info('Created data directory', { path: dataDir });
        }
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
            logger.info('Created backup directory', { path: backupDir });
        }
    }
    
    /**
     * Initialize database connection and create tables
     */
    async initialize() {
        try {
            await this.connect();
            await this.createTables();
            await this.runMigrations();
            
            logger.info('Database initialized successfully', {
                dbPath: this.dbPath,
                tables: await this.getTableList()
            });
            
            return true;
        } catch (error) {
            logger.error('Failed to initialize database:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    
    /**
     * Connect to SQLite database
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logger.error('Database connection failed:', { error: err.message });
                    reject(err);
                } else {
                    this.isConnected = true;
                    logger.info('Connected to SQLite database', { path: this.dbPath });
                    
                    // Enable foreign keys
                    this.db.run('PRAGMA foreign_keys = ON');
                    
                    resolve();
                }
            });
        });
    }
    
    /**
     * Create database tables
     */
    async createTables() {
        const tables = [
            // Guild configurations
            `CREATE TABLE IF NOT EXISTS guild_configs (
                guild_id TEXT PRIMARY KEY,
                config_data TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // User warnings and violations
            `CREATE TABLE IF NOT EXISTS user_warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                warning_type TEXT DEFAULT 'manual',
                severity INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                is_active BOOLEAN DEFAULT 1
            )`,
            
            // Moderation action history
            `CREATE TABLE IF NOT EXISTS moderation_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT,
                action_type TEXT NOT NULL,
                reason TEXT,
                duration INTEGER,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // User violations tracking
            `CREATE TABLE IF NOT EXISTS user_violations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                violation_type TEXT NOT NULL,
                severity INTEGER DEFAULT 1,
                auto_detected BOOLEAN DEFAULT 0,
                message_content TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Spam detection data
            `CREATE TABLE IF NOT EXISTS spam_detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                message_id TEXT,
                detection_type TEXT NOT NULL,
                confidence_score REAL,
                message_content TEXT,
                similarity_score REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Security events
            `CREATE TABLE IF NOT EXISTS security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT,
                event_type TEXT NOT NULL,
                severity TEXT DEFAULT 'medium',
                description TEXT,
                metadata TEXT,
                resolved BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Bot statistics
            `CREATE TABLE IF NOT EXISTS bot_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                metric_unit TEXT,
                metadata TEXT,
                recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Audit logs
            `CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                action TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                old_value TEXT,
                new_value TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];
        
        for (const tableSQL of tables) {
            await this.run(tableSQL);
        }
        
        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_user_warnings_guild_user ON user_warnings(guild_id, user_id)',
            'CREATE INDEX IF NOT EXISTS idx_user_warnings_active ON user_warnings(is_active, expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_moderation_actions_guild ON moderation_actions(guild_id, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_user_violations_guild_user ON user_violations(guild_id, user_id)',
            'CREATE INDEX IF NOT EXISTS idx_spam_detections_guild ON spam_detections(guild_id, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_security_events_guild ON security_events(guild_id, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_bot_statistics_metric ON bot_statistics(metric_name, recorded_at)',
            'CREATE INDEX IF NOT EXISTS idx_audit_logs_guild ON audit_logs(guild_id, created_at)'
        ];
        
        for (const indexSQL of indexes) {
            await this.run(indexSQL);
        }
        
        logger.info('Database tables and indexes created successfully');
    }
    
    /**
     * Run database migrations
     */
    async runMigrations() {
        // Check if migrations table exists
        await this.run(`CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL UNIQUE,
            description TEXT,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        const migrations = [
            {
                version: '2.2.0_001',
                description: 'Add user reputation system',
                sql: `CREATE TABLE IF NOT EXISTS user_reputation (
                    guild_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    reputation_score INTEGER DEFAULT 0,
                    positive_actions INTEGER DEFAULT 0,
                    negative_actions INTEGER DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, user_id)
                )`
            },
            {
                version: '2.2.0_002',
                description: 'Add message attachments tracking',
                sql: `ALTER TABLE spam_detections ADD COLUMN attachment_count INTEGER DEFAULT 0`
            }
        ];
        
        for (const migration of migrations) {
            try {
                const existing = await this.get(
                    'SELECT version FROM migrations WHERE version = ?',
                    [migration.version]
                );
                
                if (!existing) {
                    await this.run(migration.sql);
                    await this.run(
                        'INSERT INTO migrations (version, description) VALUES (?, ?)',
                        [migration.version, migration.description]
                    );
                    logger.info('Migration executed', { version: migration.version });
                }
            } catch (error) {
                logger.warn('Migration failed', {
                    version: migration.version,
                    error: error.message
                });
            }
        }
    }
    
    /**
     * Execute SQL query with parameters
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    logger.error('Database query failed:', {
                        sql: sql.substring(0, 100) + '...',
                        error: err.message
                    });
                    reject(err);
                } else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        });
    }
    
    /**
     * Get single row from database
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logger.error('Database get query failed:', {
                        sql: sql.substring(0, 100) + '...',
                        error: err.message
                    });
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    
    /**
     * Get all rows from database
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error('Database all query failed:', {
                        sql: sql.substring(0, 100) + '...',
                        error: err.message
                    });
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }
    
    /**
     * Get list of tables in database
     */
    async getTableList() {
        const rows = await this.all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        );
        return rows.map(row => row.name);
    }
    
    /**
     * Close database connection
     */
    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        logger.error('Error closing database:', { error: err.message });
                    } else {
                        logger.info('Database connection closed');
                    }
                    this.isConnected = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
    
    /**
     * Create database backup
     */
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupPath, `backup-${timestamp}.db`);
            
            // Copy database file
            fs.copyFileSync(this.dbPath, backupFile);
            
            // Compress backup if possible
            try {
                const zlib = require('zlib');
                const readStream = fs.createReadStream(backupFile);
                const writeStream = fs.createWriteStream(backupFile + '.gz');
                const gzip = zlib.createGzip();
                
                await new Promise((resolve, reject) => {
                    readStream.pipe(gzip).pipe(writeStream)
                        .on('finish', resolve)
                        .on('error', reject);
                });
                
                // Remove uncompressed backup
                fs.unlinkSync(backupFile);
                
                logger.info('Database backup created and compressed', {
                    backupFile: backupFile + '.gz'
                });
                
                return backupFile + '.gz';
            } catch (compressionError) {
                logger.info('Database backup created (uncompressed)', {
                    backupFile,
                    compressionError: compressionError.message
                });
                return backupFile;
            }
        } catch (error) {
            logger.error('Failed to create database backup:', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Get database statistics
     */
    async getStats() {
        try {
            const tables = await this.getTableList();
            const stats = {
                tables: tables.length,
                tableStats: {}
            };
            
            for (const table of tables) {
                const result = await this.get(`SELECT COUNT(*) as count FROM ${table}`);
                stats.tableStats[table] = result.count;
            }
            
            // Get database file size
            const dbStats = fs.statSync(this.dbPath);
            stats.fileSize = dbStats.size;
            stats.fileSizeMB = Math.round(dbStats.size / 1024 / 1024 * 100) / 100;
            
            return stats;
        } catch (error) {
            logger.error('Failed to get database stats:', { error: error.message });
            return null;
        }
    }
}

module.exports = DatabaseManager;
