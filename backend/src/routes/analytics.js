// src/routes/analytics.js - Analytics routes

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

// GET /api/v1/analytics/stats
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(t.id) as total_threads,
        COUNT(DISTINCT c.id) as total_collections,
        COUNT(DISTINCT tg.id) as total_tags,
        SUM(t.tweet_count) as total_tweets,
        AVG(t.tweet_count) as avg_thread_length,
        SUM(t.likes) as total_likes,
        SUM(t.retweets) as total_retweets
      FROM users u
      LEFT JOIN threads t ON u.id = t.user_id
      LEFT JOIN collections c ON u.id = c.user_id
      LEFT JOIN tags tg ON u.id = tg.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [req.user.userId]);
    
    const stats = rows[0] || {
      total_threads: 0,
      total_collections: 0,
      total_tags: 0,
      total_tweets: 0,
      avg_thread_length: 0,
      total_likes: 0,
      total_retweets: 0
    };
    
    // Get activity over time
    const { rows: activityRows } = await pool.query(`
      SELECT 
        DATE(saved_at) as date,
        COUNT(*) as threads_saved
      FROM threads
      WHERE user_id = $1 AND saved_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(saved_at)
      ORDER BY date DESC
    `, [req.user.userId]);
    
    // Get top authors
    const { rows: authorsRows } = await pool.query(`
      SELECT 
        author_username,
        author_name,
        COUNT(*) as thread_count,
        SUM(tweet_count) as total_tweets
      FROM threads
      WHERE user_id = $1
      GROUP BY author_username, author_name
      ORDER BY thread_count DESC
      LIMIT 10
    `, [req.user.userId]);
    
    res.json({
      totalThreads: parseInt(stats.total_threads),
      totalCollections: parseInt(stats.total_collections),
      totalTags: parseInt(stats.total_tags),
      totalTweets: parseInt(stats.total_tweets),
      avgThreadLength: parseFloat(stats.avg_thread_length) || 0,
      totalLikes: parseInt(stats.total_likes),
      totalRetweets: parseInt(stats.total_retweets),
      activityLast30Days: activityRows,
      topAuthors: authorsRows
    });
    
  } catch (error) {
    console.error('Get analytics stats error:', error);
    res.status(500).json({ error: 'Failed to get analytics stats' });
  }
});

// GET /api/v1/analytics/activity
router.get('/activity', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let interval = '30 days';
    let groupBy = 'DATE(saved_at)';
    
    switch (period) {
      case '7d':
        interval = '7 days';
        break;
      case '90d':
        interval = '90 days';
        break;
      case '1y':
        interval = '1 year';
        groupBy = 'DATE_TRUNC(\'month\', saved_at)';
        break;
    }
    
    const { rows } = await pool.query(`
      SELECT 
        ${groupBy} as period,
        COUNT(*) as threads_saved,
        SUM(tweet_count) as tweets_saved,
        COUNT(DISTINCT author_username) as unique_authors
      FROM threads
      WHERE user_id = $1 AND saved_at >= CURRENT_DATE - INTERVAL '${interval}'
      GROUP BY ${groupBy}
      ORDER BY period DESC
    `, [req.user.userId]);
    
    res.json({ activity: rows });
    
  } catch (error) {
    console.error('Get activity analytics error:', error);
    res.status(500).json({ error: 'Failed to get activity analytics' });
  }
});

// GET /api/v1/analytics/insights
router.get('/insights', async (req, res) => {
  try {
    // Most active saving day
    const { rows: dayRows } = await pool.query(`
      SELECT 
        EXTRACT(DOW FROM saved_at) as day_of_week,
        COUNT(*) as thread_count
      FROM threads
      WHERE user_id = $1
      GROUP BY EXTRACT(DOW FROM saved_at)
      ORDER BY thread_count DESC
      LIMIT 1
    `, [req.user.userId]);
    
    // Average thread length trend
    const { rows: lengthRows } = await pool.query(`
      SELECT 
        DATE_TRUNC('month', saved_at) as month,
        AVG(tweet_count) as avg_length
      FROM threads
      WHERE user_id = $1
      GROUP BY DATE_TRUNC('month', saved_at)
      ORDER BY month DESC
      LIMIT 6
    `, [req.user.userId]);
    
    // Content type distribution
    const { rows: contentRows } = await pool.query(`
      SELECT 
        CASE 
          WHEN has_media THEN 'with_media'
          ELSE 'text_only'
        END as content_type,
        COUNT(*) as count
      FROM threads
      WHERE user_id = $1
      GROUP BY has_media
    `, [req.user.userId]);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mostActiveDay = dayRows[0] ? dayNames[dayRows[0].day_of_week] : null;
    
    res.json({
      mostActiveDay,
      avgLengthTrend: lengthRows,
      contentDistribution: contentRows,
      insights: [
        mostActiveDay ? `You save most threads on ${mostActiveDay}s` : null,
        lengthRows.length > 1 && lengthRows[0].avg_length > lengthRows[1].avg_length ? 
          'Your threads are getting longer over time' : null,
        contentRows.find(c => c.content_type === 'with_media')?.count > 0 ? 
          'You prefer threads with media content' : null
      ].filter(Boolean)
    });
    
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

module.exports = router;