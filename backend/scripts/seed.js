// scripts/seed.js - Database seeding script for ThreadKeeper

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'threadkeeper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123'
};

const pool = new Pool(dbConfig);

// Sample data
const sampleUsers = [
  {
    email: 'demo@threadkeeper.app',
    username: 'demo_user',
    password: 'demo123',
    is_premium: true,
    premium_tier: 2
  },
  {
    email: 'test@example.com',
    username: 'test_user',
    password: 'test123',
    is_premium: false,
    premium_tier: 0
  }
];

const sampleThreads = [
  {
    url: 'https://twitter.com/elonmusk/status/1234567890',
    author_username: 'elonmusk',
    author_name: 'Elon Musk',
    author_verified: true,
    tweets: [
      {
        id: '1234567890',
        text: 'This is a sample thread about AI and the future of technology. Thread 1/3',
        timestamp: '2024-01-15T10:00:00Z',
        media: [],
        links: []
      },
      {
        id: '1234567891',
        text: 'AI will fundamentally change how we work and live. The key is ensuring it benefits humanity. 2/3',
        timestamp: '2024-01-15T10:02:00Z',
        media: [],
        links: []
      },
      {
        id: '1234567892',
        text: 'We need thoughtful regulation and responsible development. The future depends on getting this right. 3/3',
        timestamp: '2024-01-15T10:04:00Z',
        media: [],
        links: []
      }
    ],
    metadata: {
      tweetCount: 3,
      hasMedia: false,
      language: 'en'
    },
    likes: 15420,
    retweets: 3200,
    replies: 890,
    tweet_count: 3
  },
  {
    url: 'https://twitter.com/naval/status/1234567900',
    author_username: 'naval',
    author_name: 'Naval',
    author_verified: true,
    tweets: [
      {
        id: '1234567900',
        text: 'How to get rich without getting lucky - a thread on wealth creation principles. 1/10',
        timestamp: '2024-01-14T14:30:00Z',
        media: [],
        links: []
      },
      {
        id: '1234567901',
        text: 'Seek wealth, not money or status. Wealth is having assets that earn while you sleep. 2/10',
        timestamp: '2024-01-14T14:32:00Z',
        media: [],
        links: []
      }
    ],
    metadata: {
      tweetCount: 2,
      hasMedia: false,
      language: 'en'
    },
    likes: 42300,
    retweets: 8100,
    replies: 1200,
    tweet_count: 2
  }
];

const sampleCollections = [
  {
    name: 'AI & Technology',
    description: 'Threads about artificial intelligence and future technology',
    color: '#1D9BF0'
  },
  {
    name: 'Business & Investing',
    description: 'Threads about business strategy and investment advice',
    color: '#00BA7C'
  },
  {
    name: 'Personal Development',
    description: 'Threads about self-improvement and productivity',
    color: '#F4212E'
  }
];

const sampleTags = [
  { name: 'AI', color: '#667eea' },
  { name: 'Business', color: '#764ba2' },
  { name: 'Investing', color: '#f093fb' },
  { name: 'Technology', color: '#4facfe' },
  { name: 'Philosophy', color: '#43e97b' },
  { name: 'Productivity', color: '#38ef7d' }
];

async function seedUsers() {
  console.log('Seeding users...');
  
  const insertedUsers = [];
  
  for (const userData of sampleUsers) {
    try {
      // Check if user already exists
      const { rows: existingUsers } = await pool.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [userData.email, userData.username]
      );
      
      if (existingUsers.length > 0) {
        console.log(`User ${userData.username} already exists, skipping...`);
        insertedUsers.push(existingUsers[0]);
        continue;
      }
      
      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);
      
      // Insert user
      const { rows } = await pool.query(`
        INSERT INTO users (email, username, password_hash, is_premium, premium_tier, email_verified)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id, username
      `, [
        userData.email,
        userData.username,
        passwordHash,
        userData.is_premium,
        userData.premium_tier
      ]);
      
      insertedUsers.push(rows[0]);
      console.log(`✓ Created user: ${userData.username}`);
      
    } catch (error) {
      console.error(`Failed to create user ${userData.username}:`, error.message);
    }
  }
  
  return insertedUsers;
}

async function seedCollections(userId) {
  console.log('Seeding collections...');
  
  const insertedCollections = [];
  
  for (const collectionData of sampleCollections) {
    try {
      const { rows } = await pool.query(`
        INSERT INTO collections (user_id, name, description, color)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name
      `, [userId, collectionData.name, collectionData.description, collectionData.color]);
      
      insertedCollections.push(rows[0]);
      console.log(`✓ Created collection: ${collectionData.name}`);
      
    } catch (error) {
      console.error(`Failed to create collection ${collectionData.name}:`, error.message);
    }
  }
  
  return insertedCollections;
}

async function seedTags(userId) {
  console.log('Seeding tags...');
  
  const insertedTags = [];
  
  for (const tagData of sampleTags) {
    try {
      const { rows } = await pool.query(`
        INSERT INTO tags (user_id, name, color)
        VALUES ($1, $2, $3)
        RETURNING id, name
      `, [userId, tagData.name, tagData.color]);
      
      insertedTags.push(rows[0]);
      console.log(`✓ Created tag: ${tagData.name}`);
      
    } catch (error) {
      console.error(`Failed to create tag ${tagData.name}:`, error.message);
    }
  }
  
  return insertedTags;
}

async function seedThreads(userId, collections, tags) {
  console.log('Seeding threads...');
  
  const insertedThreads = [];
  
  for (let i = 0; i < sampleThreads.length; i++) {
    const threadData = sampleThreads[i];
    
    try {
      const { rows } = await pool.query(`
        INSERT INTO threads (
          user_id, url, author_username, author_name, author_verified,
          tweets, metadata, likes, retweets, replies, tweet_count, has_media, language
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, author_username
      `, [
        userId,
        threadData.url,
        threadData.author_username,
        threadData.author_name,
        threadData.author_verified,
        JSON.stringify(threadData.tweets),
        JSON.stringify(threadData.metadata),
        threadData.likes,
        threadData.retweets,
        threadData.replies,
        threadData.tweet_count,
        threadData.has_media || false,
        threadData.language || 'en'
      ]);
      
      const thread = rows[0];
      insertedThreads.push(thread);
      
      // Add thread to a collection
      if (collections.length > 0) {
        const collectionIndex = i % collections.length;
        await pool.query(`
          INSERT INTO thread_collections (thread_id, collection_id)
          VALUES ($1, $2)
        `, [thread.id, collections[collectionIndex].id]);
      }
      
      // Add some tags to threads
      if (tags.length > 0) {
        const numTags = Math.min(2, tags.length);
        for (let j = 0; j < numTags; j++) {
          const tagIndex = (i + j) % tags.length;
          await pool.query(`
            INSERT INTO thread_tags (thread_id, tag_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [thread.id, tags[tagIndex].id]);
        }
      }
      
      console.log(`✓ Created thread: @${threadData.author_username}`);
      
    } catch (error) {
      console.error(`Failed to create thread from @${threadData.author_username}:`, error.message);
    }
  }
  
  return insertedThreads;
}

async function updateTagCounts() {
  console.log('Updating tag counts...');
  
  try {
    await pool.query(`
      UPDATE tags 
      SET thread_count = (
        SELECT COUNT(*) 
        FROM thread_tags 
        WHERE thread_tags.tag_id = tags.id
      )
    `);
    
    console.log('✓ Updated tag counts');
  } catch (error) {
    console.error('Failed to update tag counts:', error.message);
  }
}

async function main() {
  try {
    console.log('Starting database seeding...');
    
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✓ Database connection successful');
    
    // Check if we should seed (avoid duplicates)
    const { rows: userCount } = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount[0].count) >= sampleUsers.length) {
      console.log('Database already has sample data, skipping seed...');
      console.log('Use --force flag to seed anyway');
      return;
    }
    
    // Seed data
    const users = await seedUsers();
    
    if (users.length === 0) {
      console.log('No users created, skipping other data');
      return;
    }
    
    // Use first user for sample data
    const primaryUser = users[0];
    console.log(`Using user ${primaryUser.username} for sample data`);
    
    const collections = await seedCollections(primaryUser.id);
    const tags = await seedTags(primaryUser.id);
    const threads = await seedThreads(primaryUser.id, collections, tags);
    
    await updateTagCounts();
    
    console.log('\n🎉 Database seeding completed successfully!');
    console.log(`Created: ${users.length} users, ${collections.length} collections, ${tags.length} tags, ${threads.length} threads`);
    
    console.log('\nDemo login credentials:');
    console.log('Email: demo@threadkeeper.app');
    console.log('Password: demo123');
    
  } catch (error) {
    console.error('\n❌ Database seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { seedUsers, seedCollections, seedTags, seedThreads };