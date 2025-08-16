// src/routes/collections.js - Collection management routes

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
const createCollectionSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow(''),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).default('#1D9BF0'),
  parentId: Joi.string().uuid().allow(null)
});

const updateCollectionSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  description: Joi.string().max(1000).allow(''),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
  parentId: Joi.string().uuid().allow(null)
});

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/v1/collections
router.get('/', async (req, res) => {
  try {
    const { includeThreads = false } = req.query;
    
    let query = `
      SELECT 
        c.*,
        COUNT(tc.thread_id) as thread_count
      FROM collections c
      LEFT JOIN thread_collections tc ON c.id = tc.collection_id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `;
    
    const { rows } = await pool.query(query, [req.user.userId]);
    
    const collections = rows.map(collection => ({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      color: collection.color,
      createdAt: collection.created_at,
      updatedAt: collection.updated_at,
      parentId: collection.parent_id,
      isPublic: collection.is_public,
      shareToken: collection.share_token,
      threadCount: parseInt(collection.thread_count)
    }));
    
    // If requested, include threads for each collection
    if (includeThreads === 'true') {
      for (const collection of collections) {
        const { rows: threads } = await pool.query(`
          SELECT t.id, t.url, t.author_username, t.author_name, t.saved_at, t.tweet_count
          FROM threads t
          JOIN thread_collections tc ON t.id = tc.thread_id
          WHERE tc.collection_id = $1
          ORDER BY tc.added_at DESC
        `, [collection.id]);
        
        collection.threads = threads;
      }
    }
    
    res.json({ collections });
    
  } catch (error) {
    console.error('Get collections error:', error);
    res.status(500).json({
      error: 'Failed to get collections',
      message: 'Unable to retrieve collections'
    });
  }
});

// GET /api/v1/collections/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get collection details
    const { rows: collectionRows } = await pool.query(`
      SELECT * FROM collections WHERE id = $1 AND user_id = $2
    `, [id, req.user.userId]);
    
    if (collectionRows.length === 0) {
      return res.status(404).json({
        error: 'Collection not found',
        message: 'Collection does not exist or you do not have access to it'
      });
    }
    
    const collection = collectionRows[0];
    
    // Get threads in this collection
    const { rows: threads } = await pool.query(`
      SELECT 
        t.*,
        tc.added_at,
        array_agg(DISTINCT tt.tag_id) FILTER (WHERE tt.tag_id IS NOT NULL) as tag_ids
      FROM threads t
      JOIN thread_collections tc ON t.id = tc.thread_id
      LEFT JOIN thread_tags tt ON t.id = tt.thread_id
      WHERE tc.collection_id = $1
      GROUP BY t.id, tc.added_at
      ORDER BY tc.added_at DESC
    `, [id]);
    
    const formattedThreads = threads.map(thread => ({
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
      addedToCollection: thread.added_at,
      likes: thread.likes,
      retweets: thread.retweets,
      replies: thread.replies,
      tweetCount: thread.tweet_count,
      hasMedia: thread.has_media,
      language: thread.language,
      tagIds: thread.tag_ids || []
    }));
    
    res.json({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      color: collection.color,
      createdAt: collection.created_at,
      updatedAt: collection.updated_at,
      parentId: collection.parent_id,
      isPublic: collection.is_public,
      shareToken: collection.share_token,
      threadCount: threads.length,
      threads: formattedThreads
    });
    
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({
      error: 'Failed to get collection',
      message: 'Unable to retrieve collection'
    });
  }
});

// POST /api/v1/collections
router.post('/', async (req, res) => {
  try {
    // Validate input
    const { error, value } = createCollectionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { name, description, color, parentId } = value;
    
    // Check if parent collection exists (if specified)
    if (parentId) {
      const { rows: parentRows } = await pool.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [parentId, req.user.userId]
      );
      
      if (parentRows.length === 0) {
        return res.status(400).json({
          error: 'Parent collection not found',
          message: 'The specified parent collection does not exist'
        });
      }
    }
    
    // Check for duplicate names at the same level
    const { rows: duplicateRows } = await pool.query(`
      SELECT id FROM collections 
      WHERE user_id = $1 AND name = $2 AND parent_id IS NOT DISTINCT FROM $3
    `, [req.user.userId, name, parentId]);
    
    if (duplicateRows.length > 0) {
      return res.status(409).json({
        error: 'Collection name already exists',
        message: 'A collection with this name already exists at this level'
      });
    }
    
    // Create collection
    const { rows } = await pool.query(`
      INSERT INTO collections (user_id, name, description, color, parent_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.userId, name, description || '', color, parentId]);
    
    const collection = rows[0];
    
    res.status(201).json({
      message: 'Collection created successfully',
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        color: collection.color,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at,
        parentId: collection.parent_id,
        isPublic: collection.is_public,
        shareToken: collection.share_token,
        threadCount: 0
      }
    });
    
  } catch (error) {
    console.error('Create collection error:', error);
    res.status(500).json({
      error: 'Failed to create collection',
      message: 'Unable to create collection'
    });
  }
});

// PUT /api/v1/collections/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate input
    const { error, value } = updateCollectionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    // Check if collection exists and belongs to user
    const { rows: existingRows } = await pool.query(
      'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        error: 'Collection not found',
        message: 'Collection does not exist or you do not have access to it'
      });
    }
    
    const existingCollection = existingRows[0];
    
    // Check for circular parent references
    if (value.parentId) {
      if (value.parentId === id) {
        return res.status(400).json({
          error: 'Invalid parent',
          message: 'A collection cannot be its own parent'
        });
      }
      
      // Check if the parent collection exists
      const { rows: parentRows } = await pool.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [value.parentId, req.user.userId]
      );
      
      if (parentRows.length === 0) {
        return res.status(400).json({
          error: 'Parent collection not found',
          message: 'The specified parent collection does not exist'
        });
      }
    }
    
    // Check for duplicate names if name is being changed
    if (value.name && value.name !== existingCollection.name) {
      const { rows: duplicateRows } = await pool.query(`
        SELECT id FROM collections 
        WHERE user_id = $1 AND name = $2 AND parent_id IS NOT DISTINCT FROM $3 AND id != $4
      `, [req.user.userId, value.name, value.parentId || existingCollection.parent_id, id]);
      
      if (duplicateRows.length > 0) {
        return res.status(409).json({
          error: 'Collection name already exists',
          message: 'A collection with this name already exists at this level'
        });
      }
    }
    
    // Build update query
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) {
        if (key === 'parentId') {
          updateFields.push(`parent_id = $${paramIndex}`);
        } else {
          updateFields.push(`${key} = $${paramIndex}`);
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
    
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id, req.user.userId);
    
    const query = `
      UPDATE collections 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, params);
    const collection = rows[0];
    
    // Get thread count
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) as count FROM thread_collections WHERE collection_id = $1',
      [id]
    );
    
    res.json({
      message: 'Collection updated successfully',
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        color: collection.color,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at,
        parentId: collection.parent_id,
        isPublic: collection.is_public,
        shareToken: collection.share_token,
        threadCount: parseInt(countRows[0].count)
      }
    });
    
  } catch (error) {
    console.error('Update collection error:', error);
    res.status(500).json({
      error: 'Failed to update collection',
      message: 'Unable to update collection'
    });
  }
});

// DELETE /api/v1/collections/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if collection exists and belongs to user
    const { rows: existingRows } = await pool.query(
      'SELECT name FROM collections WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        error: 'Collection not found',
        message: 'Collection does not exist or you do not have access to it'
      });
    }
    
    // Check if collection has child collections
    const { rows: childRows } = await pool.query(
      'SELECT COUNT(*) as count FROM collections WHERE parent_id = $1',
      [id]
    );
    
    if (parseInt(childRows[0].count) > 0) {
      return res.status(400).json({
        error: 'Collection has children',
        message: 'Cannot delete a collection that contains child collections'
      });
    }
    
    // Get thread count before deletion
    const { rows: threadRows } = await pool.query(
      'SELECT COUNT(*) as count FROM thread_collections WHERE collection_id = $1',
      [id]
    );
    
    const threadCount = parseInt(threadRows[0].count);
    
    // Delete collection (this will cascade to thread_collections)
    await pool.query('DELETE FROM collections WHERE id = $1', [id]);
    
    res.json({
      message: 'Collection deleted successfully',
      threadsAffected: threadCount
    });
    
  } catch (error) {
    console.error('Delete collection error:', error);
    res.status(500).json({
      error: 'Failed to delete collection',
      message: 'Unable to delete collection'
    });
  }
});

// POST /api/v1/collections/:id/threads/:threadId
router.post('/:id/threads/:threadId', async (req, res) => {
  try {
    const { id: collectionId, threadId } = req.params;
    
    // Check if collection exists and belongs to user
    const { rows: collectionRows } = await pool.query(
      'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
      [collectionId, req.user.userId]
    );
    
    if (collectionRows.length === 0) {
      return res.status(404).json({
        error: 'Collection not found',
        message: 'Collection does not exist or you do not have access to it'
      });
    }
    
    // Check if thread exists and belongs to user
    const { rows: threadRows } = await pool.query(
      'SELECT id FROM threads WHERE id = $1 AND user_id = $2',
      [threadId, req.user.userId]
    );
    
    if (threadRows.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        message: 'Thread does not exist or you do not have access to it'
      });
    }
    
    // Check if thread is already in collection
    const { rows: existingRows } = await pool.query(
      'SELECT 1 FROM thread_collections WHERE thread_id = $1 AND collection_id = $2',
      [threadId, collectionId]
    );
    
    if (existingRows.length > 0) {
      return res.status(409).json({
        error: 'Thread already in collection',
        message: 'This thread is already in the specified collection'
      });
    }
    
    // Add thread to collection
    await pool.query(`
      INSERT INTO thread_collections (thread_id, collection_id)
      VALUES ($1, $2)
    `, [threadId, collectionId]);
    
    res.status(201).json({
      message: 'Thread added to collection successfully'
    });
    
  } catch (error) {
    console.error('Add thread to collection error:', error);
    res.status(500).json({
      error: 'Failed to add thread to collection',
      message: 'Unable to add thread to collection'
    });
  }
});

// DELETE /api/v1/collections/:id/threads/:threadId
router.delete('/:id/threads/:threadId', async (req, res) => {
  try {
    const { id: collectionId, threadId } = req.params;
    
    // Check if collection exists and belongs to user
    const { rows: collectionRows } = await pool.query(
      'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
      [collectionId, req.user.userId]
    );
    
    if (collectionRows.length === 0) {
      return res.status(404).json({
        error: 'Collection not found',
        message: 'Collection does not exist or you do not have access to it'
      });
    }
    
    // Check if thread exists and belongs to user
    const { rows: threadRows } = await pool.query(
      'SELECT id FROM threads WHERE id = $1 AND user_id = $2',
      [threadId, req.user.userId]
    );
    
    if (threadRows.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        message: 'Thread does not exist or you do not have access to it'
      });
    }
    
    // Remove thread from collection
    const { rowCount } = await pool.query(
      'DELETE FROM thread_collections WHERE thread_id = $1 AND collection_id = $2',
      [threadId, collectionId]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({
        error: 'Thread not in collection',
        message: 'This thread is not in the specified collection'
      });
    }
    
    res.json({
      message: 'Thread removed from collection successfully'
    });
    
  } catch (error) {
    console.error('Remove thread from collection error:', error);
    res.status(500).json({
      error: 'Failed to remove thread from collection',
      message: 'Unable to remove thread from collection'
    });
  }
});

module.exports = router;