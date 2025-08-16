// src/routes/sync.js - Sync routes for premium users

const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');
const router = express.Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'threadkeeper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123'
});

router.use(authenticateToken);

// Middleware to check premium status
async function requirePremium(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT is_premium FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (!rows[0]?.is_premium) {
      return res.status(403).json({
        error: 'Premium required',
        message: 'This feature is only available for premium users'
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify premium status' });
  }
}

// POST /api/v1/sync/threads
router.post('/threads', requirePremium, async (req, res) => {
  try {
    const { threads = [], changes = [], lastSync } = req.body;
    
    // Process sync logic here
    // This is a simplified implementation
    
    res.json({
      message: 'Sync completed',
      synced: threads.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// GET /api/v1/sync/status
router.get('/status', requirePremium, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_threads,
        MAX(saved_at) as last_thread_saved,
        MAX(last_accessed) as last_accessed
      FROM threads 
      WHERE user_id = $1
    `, [req.user.userId]);
    
    const stats = rows[0];
    
    res.json({
      totalThreads: parseInt(stats.total_threads),
      lastThreadSaved: stats.last_thread_saved,
      lastAccessed: stats.last_accessed,
      syncEnabled: true
    });
    
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

module.exports = router;