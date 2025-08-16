// src/routes/threads.js - Thread management routes

const express = require('express');
const { Pool } = require('pg');
const Joi = require('joi');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'threadkeeper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123'
});

// Validation schemas
const createThreadSchema = Joi.object({
  url: Joi.string().uri().required(),
  authorUsername: Joi.string().required(),
  authorName: Joi.string().required(),
  authorAvatar: Joi.string().uri().allow(''),
  authorVerified: Joi.boolean().default(false),
  tweets: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    text: Joi.string().required(),
    timestamp: Joi.string().isoDate().allow(null),
    media: Joi.array().default([]),
    links: Joi.array().default([]),
    authorUsername: Joi.string(),
    authorName: Joi.string(),
    isReply: Joi.boolean().default(false),
    hasQuoteTweet: Joi.boolean().default(false)
  })).min(1).required(),
  metadata: Joi.object().default({}),
  likes: Joi.number().min(0).default(0),
  retweets: Joi.number().min(0).default(0),
  replies: Joi.number().min(0).default(0)
});

const updateThreadSchema = Joi.object({
  authorName: Joi.string(),
  authorAvatar: Joi.string().uri().allow(''),
  authorVerified: Joi.boolean(),
  metadata: Joi.object(),
  likes: Joi.number().min(0),
  retweets: Joi.number().min(0),
  replies: Joi.number().min(0)
});

const searchSchema = Joi.object({
  query: Joi.string().required(),
  limit: Joi.number().min(1).max(100).default(20),
  offset: Joi.number().min(0).default(0),
  collectionId: Joi.string().uuid(),
  tags: Joi.array().items(Joi.string().uuid()),
  author: Joi.string(),
  dateFrom: Joi.string().isoDate(),
  dateTo: Joi.string().isoDate()
});

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/v1/threads
router.get('/', async (req, res) => {
  try {
    const {
      limit = 20,
      offset = 0,
      collectionId,
      tags,
      author,
      sortBy = 'saved_at',
      sortOrder = 'desc'
    } = req.query;
    
    let query = `
      SELECT 
        t.*,
        array_agg(DISTINCT tc.collection_id) FILTER (WHERE tc.collection_id IS NOT NULL) as collection_ids,
        array_agg(DISTINCT tt.tag_id) FILTER (WHERE tt.tag_id IS NOT NULL) as tag_ids,
        array_agg(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL) as tag_names
      FROM threads t
      LEFT JOIN thread_collections tc ON t.id = tc.thread_id
      LEFT JOIN thread_tags tt ON t.id = tt.thread_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE t.user_id = $1
    `;
    
    const params = [req.user.userId];
    let paramIndex = 2;
    
    // Apply filters
    if (collectionId) {
      query += ` AND tc.collection_id = $${paramIndex}`;
      params.push(collectionId);
      paramIndex++;
    }
    
    if (tags && tags.length > 0) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query += ` AND tt.tag_id = ANY($${paramIndex})`;
      params.push(tagArray);
      paramIndex++;
    }
    
    if (author) {
      query += ` AND LOWER(t.author_username) LIKE LOWER($${paramIndex})`;
      params.push(`%${author}%`);
      paramIndex++;
    }
    
    // Group by and order
    query += ` GROUP BY t.id`;
    
    const validSortFields = ['saved_at', 'last_accessed', 'author_username', 'tweet_count', 'likes'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'saved_at';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY t.${sortField} ${order}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const { rows } = await pool.query(query, params);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT t.id) as total
      FROM threads t
      LEFT JOIN thread_collections tc ON t.id = tc.thread_id
      LEFT JOIN thread_tags tt ON t.id = tt.thread_id
      WHERE t.user_id = $1
      ${collectionId ? 'AND tc.collection_id = $2' : ''}
      ${tags && tags.length > 0 ? `AND tt.tag_id = ANY($${collectionId ? 3 : 2})` : ''}
      ${author ? `AND LOWER(t.author_username) LIKE LOWER($${paramIndex - 2})` : ''}
    `;
    
    const countParams = [req.user.userId];
    if (collectionId) countParams.push(collectionId);
    if (tags && tags.length > 0) countParams.push(Array.isArray(tags) ? tags : [tags]);
    if (author) countParams.push(`%${author}%`);
    
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);
    
    // Format response
    const threads = rows.map(thread => ({
      id: thread.id,
      url: thread.url,
      authorUsername: thread.author_username,
      authorName: thread.author_name,
      authorAvatar: thread.author_avatar,
      authorVerified: thread.author_verified,
      tweets: thread.tweets,
      metadata: thread.metadata,
      savedAt: thread.saved_at,
      lastAccessed: thread.last_accessed,
      likes: thread.likes,
      retweets: thread.retweets,
      replies: thread.replies,
      tweetCount: thread.tweet_count,
      hasMedia: thread.has_media,
      language: thread.language,
      collectionIds: thread.collection_ids || [],
      tagIds: thread.tag_ids || [],
      tagNames: thread.tag_names || []
    }));
    
    res.json({
      threads,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + limit < total
      }
    });
    
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({
      error: 'Failed to get threads',
      message: 'Unable to retrieve threads'
    });
  }
});

// GET /api/v1/threads/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
      SELECT 
        t.*,
        array_agg(DISTINCT tc.collection_id) FILTER (WHERE tc.collection_id IS NOT NULL) as collection_ids,
        array_agg(DISTINCT tt.tag_id) FILTER (WHERE tt.tag_id IS NOT NULL) as tag_ids,
        array_agg(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL) as tag_names
      FROM threads t
      LEFT JOIN thread_collections tc ON t.id = tc.thread_id
      LEFT JOIN thread_tags tt ON t.id = tt.thread_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE t.id = $1 AND t.user_id = $2
      GROUP BY t.id
    `, [id, req.user.userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        message: 'Thread does not exist or you do not have access to it'
      });
    }
    
    const thread = rows[0];
    
    // Update last accessed time
    await pool.query(
      'UPDATE threads SET last_accessed = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    
    res.json({
      id: thread.id,
      url: thread.url,
      authorUsername: thread.author_username,
      authorName: thread.author_name,
      authorAvatar: thread.author_avatar,
      authorVerified: thread.author_verified,
      tweets: thread.tweets,
      metadata: thread.metadata,
      savedAt: thread.saved_at,
      lastAccessed: thread.last_accessed,
      likes: thread.likes,
      retweets: thread.retweets,
      replies: thread.replies,
      tweetCount: thread.tweet_count,
      hasMedia: thread.has_media,
      language: thread.language,
      collectionIds: thread.collection_ids || [],
      tagIds: thread.tag_ids || [],
      tagNames: thread.tag_names || []
    });
    
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({
      error: 'Failed to get thread',
      message: 'Unable to retrieve thread'
    });
  }
});

// POST /api/v1/threads
router.post('/', async (req, res) => {
  try {
    // Validate input
    const { error, value } = createThreadSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const {
      url,
      authorUsername,
      authorName,
      authorAvatar,
      authorVerified,
      tweets,
      metadata,
      likes,
      retweets,
      replies
    } = value;
    
    // Check if thread already exists for this user
    const { rows: existingThreads } = await pool.query(
      'SELECT id FROM threads WHERE user_id = $1 AND url = $2',
      [req.user.userId, url]
    );
    
    if (existingThreads.length > 0) {
      return res.status(409).json({
        error: 'Thread already exists',
        message: 'This thread has already been saved',
        threadId: existingThreads[0].id
      });
    }
    
    // Check storage limits for free users
    const { rows: userRows } = await pool.query(
      'SELECT is_premium FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    const isPremium = userRows[0]?.is_premium || false;
    
    if (!isPremium) {
      const { rows: countRows } = await pool.query(
        'SELECT COUNT(*) as count FROM threads WHERE user_id = $1',
        [req.user.userId]
      );
      
      const threadCount = parseInt(countRows[0].count);
      if (threadCount >= 50) { // Free tier limit
        return res.status(403).json({
          error: 'Storage limit reached',
          message: 'Free accounts are limited to 50 threads. Upgrade to Pro for unlimited storage.',
          currentCount: threadCount,
          limit: 50
        });
      }
    }
    
    // Calculate derived fields
    const tweetCount = tweets.length;
    const hasMedia = tweets.some(tweet => tweet.media && tweet.media.length > 0);
    const language = metadata.language || 'en';
    
    // Insert thread
    const { rows } = await pool.query(`
      INSERT INTO threads (
        user_id, url, author_username, author_name, author_avatar, author_verified,
        tweets, metadata, likes, retweets, replies, tweet_count, has_media, language
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, saved_at
    `, [
      req.user.userId,
      url,
      authorUsername,
      authorName,
      authorAvatar || '',
      authorVerified,
      JSON.stringify(tweets),
      JSON.stringify(metadata),
      likes,
      retweets,
      replies,
      tweetCount,
      hasMedia,
      language
    ]);
    
    const thread = rows[0];
    
    // Log analytics event
    await pool.query(`
      INSERT INTO analytics_events (user_id, event_type, event_data)
      VALUES ($1, 'thread_saved', $2)
    `, [
      req.user.userId,
      JSON.stringify({
        threadId: thread.id,
        authorUsername,
        tweetCount,
        hasMedia
      })
    ]);
    
    res.status(201).json({
      message: 'Thread saved successfully',
      thread: {
        id: thread.id,
        url,
        authorUsername,
        authorName,
        authorAvatar,
        authorVerified,
        tweets,
        metadata,
        savedAt: thread.saved_at,
        lastAccessed: thread.saved_at,
        likes,
        retweets,
        replies,
        tweetCount,
        hasMedia,
        language,
        collectionIds: [],
        tagIds: [],
        tagNames: []
      }
    });
    
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(500).json({
      error: 'Failed to save thread',
      message: 'Unable to save thread'
    });
  }
});

// PUT /api/v1/threads/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate input
    const { error, value } = updateThreadSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    // Check if thread exists and belongs to user
    const { rows: existingThreads } = await pool.query(
      'SELECT id FROM threads WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (existingThreads.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        message: 'Thread does not exist or you do not have access to it'
      });
    }
    
    // Build update query
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) {
        if (key === 'authorName') {
          updateFields.push(`author_name = ${paramIndex}`);
        } else if (key === 'authorAvatar') {
          updateFields.push(`author_avatar = ${paramIndex}`);
        } else if (key === 'authorVerified') {
          updateFields.push(`author_verified = ${paramIndex}`);
        } else if (key === 'metadata') {
          updateFields.push(`metadata = ${paramIndex}`);
          val = JSON.stringify(val);
        } else {
          updateFields.push(`${key} = ${paramIndex}`);
        }
        params.push(val);
        paramIndex++;
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update'
      });
    }
    
    // Add WHERE clause parameters
    params.push(id, req.user.userId);
    
    const query = `
      UPDATE threads 
      SET ${updateFields.join(', ')}, last_accessed = CURRENT_TIMESTAMP
      WHERE id = ${paramIndex} AND user_id = ${paramIndex + 1}
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, params);
    const thread = rows[0];
    
    res.json({
      message: 'Thread updated successfully',
      thread: {
        id: thread.id,
        url: thread.url,
        authorUsername: thread.author_username,
        authorName: thread.author_name,
        authorAvatar: thread.author_avatar,
        authorVerified: thread.author_verified,
        tweets: thread.tweets,
        metadata: thread.metadata,
        savedAt: thread.saved_at,
        lastAccessed: thread.last_accessed,
        likes: thread.likes,
        retweets: thread.retweets,
        replies: thread.replies,
        tweetCount: thread.tweet_count,
        hasMedia: thread.has_media,
        language: thread.language
      }
    });
    
  } catch (error) {
    console.error('Update thread error:', error);
    res.status(500).json({
      error: 'Failed to update thread',
      message: 'Unable to update thread'
    });
  }
});

// DELETE /api/v1/threads/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if thread exists and belongs to user
    const { rows: existingThreads } = await pool.query(
      'SELECT id, author_username FROM threads WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (existingThreads.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        message: 'Thread does not exist or you do not have access to it'
      });
    }
    
    const thread = existingThreads[0];
    
    // Delete thread (cascades to related tables)
    await pool.query('DELETE FROM threads WHERE id = $1', [id]);
    
    // Log analytics event
    await pool.query(`
      INSERT INTO analytics_events (user_id, event_type, event_data)
      VALUES ($1, 'thread_deleted', $2)
    `, [
      req.user.userId,
      JSON.stringify({
        threadId: id,
        authorUsername: thread.author_username
      })
    ]);
    
    res.json({
      message: 'Thread deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete thread error:', error);
    res.status(500).json({
      error: 'Failed to delete thread',
      message: 'Unable to delete thread'
    });
  }
});

// POST /api/v1/threads/search
router.post('/search', async (req, res) => {
  try {
    // Validate input
    const { error, value } = searchSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const {
      query: searchQuery,
      limit,
      offset,
      collectionId,
      tags,
      author,
      dateFrom,
      dateTo
    } = value;
    
    // Build search query
    let query = `
      SELECT 
        t.*,
        array_agg(DISTINCT tc.collection_id) FILTER (WHERE tc.collection_id IS NOT NULL) as collection_ids,
        array_agg(DISTINCT tt.tag_id) FILTER (WHERE tt.tag_id IS NOT NULL) as tag_ids,
        ts_rank(
          to_tsvector('english', t.author_name || ' ' || t.author_username || ' ' || (t.tweets::text)),
          plainto_tsquery('english', $2)
        ) as rank
      FROM threads t
      LEFT JOIN thread_collections tc ON t.id = tc.thread_id
      LEFT JOIN thread_tags tt ON t.id = tt.thread_id
      WHERE t.user_id = $1
      AND (
        to_tsvector('english', t.author_name || ' ' || t.author_username || ' ' || (t.tweets::text))
        @@ plainto_tsquery('english', $2)
      )
    `;
    
    const params = [req.user.userId, searchQuery];
    let paramIndex = 3;
    
    // Apply additional filters
    if (collectionId) {
      query += ` AND tc.collection_id = ${paramIndex}`;
      params.push(collectionId);
      paramIndex++;
    }
    
    if (tags && tags.length > 0) {
      query += ` AND tt.tag_id = ANY(${paramIndex})`;
      params.push(tags);
      paramIndex++;
    }
    
    if (author) {
      query += ` AND LOWER(t.author_username) LIKE LOWER(${paramIndex})`;
      params.push(`%${author}%`);
      paramIndex++;
    }
    
    if (dateFrom) {
      query += ` AND t.saved_at >= ${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }
    
    if (dateTo) {
      query += ` AND t.saved_at <= ${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }
    
    query += ` GROUP BY t.id ORDER BY rank DESC, t.saved_at DESC`;
    query += ` LIMIT ${paramIndex} OFFSET ${paramIndex + 1}`;
    params.push(limit, offset);
    
    const { rows } = await pool.query(query, params);
    
    // Format results
    const results = rows.map(thread => ({
      id: thread.id,
      url: thread.url,
      authorUsername: thread.author_username,
      authorName: thread.author_name,
      authorAvatar: thread.author_avatar,
      authorVerified: thread.author_verified,
      tweets: thread.tweets,
      metadata: thread.metadata,
      savedAt: thread.saved_at,
      lastAccessed: thread.last_accessed,
      likes: thread.likes,
      retweets: thread.retweets,
      replies: thread.replies,
      tweetCount: thread.tweet_count,
      hasMedia: thread.has_media,
      language: thread.language,
      collectionIds: thread.collection_ids || [],
      tagIds: thread.tag_ids || [],
      relevanceScore: parseFloat(thread.rank)
    }));
    
    res.json({
      results,
      query: searchQuery,
      pagination: {
        limit,
        offset,
        count: results.length
      }
    });
    
  } catch (error) {
    console.error('Search threads error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Unable to search threads'
    });
  }
});

// GET /api/v1/threads/:id/export
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;
    
    // Get thread
    const { rows } = await pool.query(`
      SELECT * FROM threads WHERE id = $1 AND user_id = $2
    `, [id, req.user.userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Thread not found'
      });
    }
    
    const thread = rows[0];
    
    if (format === 'json') {
      res.json(thread);
    } else if (format === 'text') {
      let output = `Thread by @${thread.author_username} (${thread.author_name})\n`;
      output += `Saved on: ${new Date(thread.saved_at).toLocaleString()}\n`;
      output += `URL: ${thread.url}\n`;
      output += `${'='.repeat(50)}\n\n`;
      
      thread.tweets.forEach((tweet, index) => {
        output += `[${index + 1}/${thread.tweets.length}]\n`;
        output += `${tweet.text}\n`;
        if (tweet.timestamp) {
          output += `(${new Date(tweet.timestamp).toLocaleString()})\n`;
        }
        output += '\n';
      });
      
      res.set('Content-Type', 'text/plain');
      res.send(output);
    } else {
      res.status(400).json({
        error: 'Unsupported format',
        supportedFormats: ['json', 'text']
      });
    }
    
  } catch (error) {
    console.error('Export thread error:', error);
    res.status(500).json({
      error: 'Export failed',
      message: 'Unable to export thread'
    });
  }
});

module.exports = router;