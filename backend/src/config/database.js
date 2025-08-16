// backend/src/config/database.js - PostgreSQL Database Configuration

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'threadkeeper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Test database connection
pool.on('error', (err, client) => {
  logger.error('Unexpected database error on idle client', err);
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255),
        full_name VARCHAR(255),
        avatar_url TEXT,
        is_premium BOOLEAN DEFAULT FALSE,
        premium_expires_at TIMESTAMP,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP
      );
    `);

    // Create threads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS threads (
        id VARCHAR(255) PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        author_username VARCHAR(255) NOT NULL,
        author_name VARCHAR(255),
        author_avatar TEXT,
        author_verified BOOLEAN DEFAULT FALSE,
        tweets JSONB NOT NULL,
        metadata JSONB DEFAULT '{}',
        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP,
        last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        UNIQUE(user_id, url)
      );
    `);

    // Create collections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(7),
        parent_id UUID REFERENCES collections(id) ON DELETE CASCADE,
        position INTEGER DEFAULT 0,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      );
    `);

    // Create thread_collections junction table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS thread_collections (
        thread_id VARCHAR(255) REFERENCES threads(id) ON DELETE CASCADE,
        collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, collection_id)
      );
    `);

    // Create tags table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      );
    `);

    // Create thread_tags junction table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS thread_tags (
        thread_id VARCHAR(255) REFERENCES threads(id) ON DELETE CASCADE,
        tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, tag_id)
      );
    `);

    // Create sync_log table for tracking sync operations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        operation VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255),
        changes JSONB,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        device_id VARCHAR(255),
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT
      );
    `);

    // Create analytics table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_threads_user_id ON threads(user_id);
      CREATE INDEX IF NOT EXISTS idx_threads_saved_at ON threads(saved_at);
      CREATE INDEX IF NOT EXISTS idx_threads_author ON threads(author_username);
      CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id);
      CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
      CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at);
    `);

    // Create full-text search indexes
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX IF NOT EXISTS idx_threads_text_search ON threads 
        USING gin((tweets::text) gin_trgm_ops);
    `);

    logger.info('Database tables initialized successfully');
    
  } catch (error) {
    logger.error('Database initialization error:', error);
    throw error;
  }
}

// Database query wrapper with error handling
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn('Slow query detected', { text, duration, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    logger.error('Database query error', { text, error: error.message });
    throw error;
  }
}

// Transaction helper
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Close database connections
async function closeConnection() {
  await pool.end();
  logger.info('Database pool closed');
}

module.exports = {
  pool,
  query,
  transaction,
  initializeDatabase,
  closeConnection
};