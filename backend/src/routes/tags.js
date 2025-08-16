// src/routes/tags.js - Tag management routes

const express = require('express');
const { Pool } = require('pg');
const Joi = require('joi');
const { authenticateToken } = require('./auth');
const router = express.Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'threadkeeper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123'
});

const createTagSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).default('#8B98A5')
});

router.use(authenticateToken);

// GET /api/v1/tags
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, color, thread_count, created_at 
      FROM tags 
      WHERE user_id = $1 
      ORDER BY name ASC
    `, [req.user.userId]);
    
    res.json({ tags: rows });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// POST /api/v1/tags
router.post('/', async (req, res) => {
  try {
    const { error, value } = createTagSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { name, color } = value;
    
    const { rows } = await pool.query(`
      INSERT INTO tags (user_id, name, color)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [req.user.userId, name, color]);
    
    res.status(201).json({ 
      message: 'Tag created successfully',
      tag: rows[0] 
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Tag already exists' });
    }
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// PUT /api/v1/tags/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    
    const { rows } = await pool.query(`
      UPDATE tags 
      SET name = COALESCE($1, name), color = COALESCE($2, color)
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `, [name, color, id, req.user.userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    res.json({ 
      message: 'Tag updated successfully',
      tag: rows[0] 
    });
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// DELETE /api/v1/tags/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rowCount } = await pool.query(
      'DELETE FROM tags WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// POST /api/v1/tags/:id/threads/:threadId
router.post('/:id/threads/:threadId', async (req, res) => {
  try {
    const { id: tagId, threadId } = req.params;
    
    // Verify ownership
    const { rows: tagRows } = await pool.query(
      'SELECT id FROM tags WHERE id = $1 AND user_id = $2',
      [tagId, req.user.userId]
    );
    
    const { rows: threadRows } = await pool.query(
      'SELECT id FROM threads WHERE id = $1 AND user_id = $2',
      [threadId, req.user.userId]
    );
    
    if (tagRows.length === 0 || threadRows.length === 0) {
      return res.status(404).json({ error: 'Tag or thread not found' });
    }
    
    // Add tag to thread
    await pool.query(`
      INSERT INTO thread_tags (thread_id, tag_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [threadId, tagId]);
    
    // Update tag thread count
    await pool.query(`
      UPDATE tags 
      SET thread_count = (
        SELECT COUNT(*) FROM thread_tags WHERE tag_id = $1
      )
      WHERE id = $1
    `, [tagId]);
    
    res.json({ message: 'Tag added to thread successfully' });
  } catch (error) {
    console.error('Add tag to thread error:', error);
    res.status(500).json({ error: 'Failed to add tag to thread' });
  }
});

module.exports = router;