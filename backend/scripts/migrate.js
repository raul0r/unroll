// scripts/migrate.js - Database migration script for ThreadKeeper

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'threadkeeper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123'
};

console.log('Connecting to database:', {
  ...dbConfig,
  password: '***'
});

const pool = new Pool(dbConfig);

// SQL for creating tables
const migrations = [
  {
    version: 1,
    name: 'initial_tables',
    sql: `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_premium BOOLEAN DEFAULT FALSE,
        premium_tier INTEGER DEFAULT 0,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP
      );

      -- Threads table
      CREATE TABLE IF NOT EXISTS threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        author_username VARCHAR(100) NOT NULL,
        author_name VARCHAR(255) NOT NULL,
        author_avatar TEXT,
        author_verified BOOLEAN DEFAULT FALSE,
        tweets JSONB NOT NULL,
        metadata JSONB DEFAULT '{}',
        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        likes INTEGER DEFAULT 0,
        retweets INTEGER DEFAULT 0,
        replies INTEGER DEFAULT 0,
        tweet_count INTEGER DEFAULT 0,
        has_media BOOLEAN DEFAULT FALSE,
        language VARCHAR(10) DEFAULT 'en'
      );

      -- Collections table
      CREATE TABLE IF NOT EXISTS collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(7) DEFAULT '#1D9BF0',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        parent_id UUID REFERENCES collections(id) ON DELETE SET NULL,
        is_public BOOLEAN DEFAULT FALSE,
        share_token VARCHAR(255) UNIQUE
      );

      -- Tags table
      CREATE TABLE IF NOT EXISTS tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7) DEFAULT '#8B98A5',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        thread_count INTEGER DEFAULT 0,
        UNIQUE(user_id, name)
      );

      -- Thread Collections junction table
      CREATE TABLE IF NOT EXISTS thread_collections (
        thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
        collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, collection_id)
      );

      -- Thread Tags junction table
      CREATE TABLE IF NOT EXISTS thread_tags (
        thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
        tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, tag_id)
      );

      -- User sessions table
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        refresh_token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        ip_address INET
      );

      -- Analytics table
      CREATE TABLE IF NOT EXISTS analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address INET,
        user_agent TEXT
      );
    `
  },
  {
    version: 2,
    name: 'indexes_and_constraints',
    sql: `
      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_threads_user_id ON threads(user_id);
      CREATE INDEX IF NOT EXISTS idx_threads_saved_at ON threads(saved_at DESC);
      CREATE INDEX IF NOT EXISTS idx_threads_author_username ON threads(author_username);
      CREATE INDEX IF NOT EXISTS idx_threads_metadata ON threads USING GIN(metadata);
      CREATE INDEX IF NOT EXISTS idx_threads_tweets ON threads USING GIN(tweets);
      
      CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id);
      CREATE INDEX IF NOT EXISTS idx_collections_parent_id ON collections(parent_id);
      
      CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
      
      CREATE INDEX IF NOT EXISTS idx_thread_collections_collection_id ON thread_collections(collection_id);
      CREATE INDEX IF NOT EXISTS idx_thread_tags_tag_id ON thread_tags(tag_id);
      
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token ON user_sessions(refresh_token);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
      
      CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
    `
  },
  {
    version: 3,
    name: 'migration_tracking',
    sql: `
      -- Table to track applied migrations
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  }
];

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database migrations...');
    
    // Start transaction
    await client.query('BEGIN');
    
    // Create migrations tracking table first
    await client.query(migrations[2].sql);
    
    // Get already applied migrations
    const { rows: appliedMigrations } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(appliedMigrations.map(row => row.version));
    
    // Run each migration
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        console.log(`Migration ${migration.version} (${migration.name}) already applied, skipping...`);
        continue;
      }
      
      console.log(`Running migration ${migration.version}: ${migration.name}...`);
      
      try {
        // Run the migration SQL
        await client.query(migration.sql);
        
        // Record that this migration was applied
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name]
        );
        
        console.log(`✓ Migration ${migration.version} completed successfully`);
      } catch (error) {
        console.error(`✗ Migration ${migration.version} failed:`, error.message);
        throw error;
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('All migrations completed successfully!');
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Migration failed, rolling back:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function createDefaultData() {
  const client = await pool.connect();
  
  try {
    console.log('Creating default data...');
    
    // Check if we need to create default data
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) > 0) {
      console.log('Database already has data, skipping default data creation');
      return;
    }
    
    // You can add default data here if needed
    console.log('Default data creation completed');
    
  } catch (error) {
    console.error('Failed to create default data:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    // Test database connection
    console.log('Testing database connection...');
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✓ Database connection successful');
    
    // Run migrations
    await runMigrations();
    
    // Create default data
    await createDefaultData();
    
    console.log('\n🎉 Database setup completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { runMigrations, createDefaultData };