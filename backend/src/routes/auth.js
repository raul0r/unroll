// src/routes/auth.js - Authentication routes

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const Joi = require('joi');
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
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Helper functions
function generateTokens(userId) {
  const payload = { userId };
  
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
  
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
  
  return { accessToken, refreshToken };
}

async function saveRefreshToken(userId, refreshToken, userAgent, ipAddress) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  await pool.query(`
    INSERT INTO user_sessions (user_id, refresh_token, expires_at, user_agent, ip_address)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, refreshToken, expiresAt, userAgent, ipAddress]);
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { email, username, password } = value;
    
    // Check if user already exists
    const { rows: existingUsers } = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Email or username is already taken'
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Create user
    const { rows } = await pool.query(`
      INSERT INTO users (email, username, password_hash, email_verified)
      VALUES ($1, $2, $3, true)
      RETURNING id, email, username, is_premium, premium_tier, created_at
    `, [email, username, passwordHash]);
    
    const user = rows[0];
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Save refresh token
    await saveRefreshToken(
      user.id,
      refreshToken,
      req.get('User-Agent'),
      req.ip
    );
    
    // Log analytics event
    await pool.query(`
      INSERT INTO analytics_events (user_id, event_type, event_data, ip_address, user_agent)
      VALUES ($1, 'user_registered', $2, $3, $4)
    `, [
      user.id,
      JSON.stringify({ email, username }),
      req.ip,
      req.get('User-Agent')
    ]);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isPremium: user.is_premium,
        premiumTier: user.premium_tier,
        createdAt: user.created_at
      },
      token: accessToken,
      refreshToken
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'Unable to create user account'
    });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    
    const { email, password } = value;
    
    // Find user
    const { rows } = await pool.query(`
      SELECT id, email, username, password_hash, is_premium, premium_tier, created_at
      FROM users 
      WHERE email = $1
    `, [email]);
    
    if (rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
    
    const user = rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
    
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Save refresh token
    await saveRefreshToken(
      user.id,
      refreshToken,
      req.get('User-Agent'),
      req.ip
    );
    
    // Log analytics event
    await pool.query(`
      INSERT INTO analytics_events (user_id, event_type, event_data, ip_address, user_agent)
      VALUES ($1, 'user_login', $2, $3, $4)
    `, [
      user.id,
      JSON.stringify({ email }),
      req.ip,
      req.get('User-Agent')
    ]);
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isPremium: user.is_premium,
        premiumTier: user.premium_tier,
        createdAt: user.created_at
      },
      token: accessToken,
      refreshToken
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Unable to authenticate user'
    });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    
    // Check if refresh token exists in database and hasn't expired
    const { rows } = await pool.query(`
      SELECT us.user_id, u.email, u.username, u.is_premium, u.premium_tier
      FROM user_sessions us
      JOIN users u ON us.user_id = u.id
      WHERE us.refresh_token = $1 AND us.expires_at > CURRENT_TIMESTAMP
    `, [refreshToken]);
    
    if (rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }
    
    const user = rows[0];
    
    // Generate new access token
    const { accessToken: newAccessToken } = generateTokens(user.user_id);
    
    res.json({
      token: newAccessToken,
      user: {
        id: user.user_id,
        email: user.email,
        username: user.username,
        isPremium: user.is_premium,
        premiumTier: user.premium_tier
      }
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'Unable to refresh authentication token'
    });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      // Remove refresh token from database
      await pool.query(
        'DELETE FROM user_sessions WHERE refresh_token = $1',
        [refreshToken]
      );
    }
    
    // Log analytics event
    await pool.query(`
      INSERT INTO analytics_events (user_id, event_type, ip_address, user_agent)
      VALUES ($1, 'user_logout', $2, $3)
    `, [req.user.userId, req.ip, req.get('User-Agent')]);
    
    res.json({ message: 'Logout successful' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'Unable to complete logout'
    });
  }
});

// GET /api/v1/auth/verify
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // Get current user info
    const { rows } = await pool.query(`
      SELECT id, email, username, is_premium, premium_tier, created_at, last_login
      FROM users 
      WHERE id = $1
    `, [req.user.userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = rows[0];
    
    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isPremium: user.is_premium,
        premiumTier: user.premium_tier,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      error: 'Verification failed',
      message: 'Unable to verify token'
    });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get user profile with stats
    const { rows } = await pool.query(`
      SELECT 
        u.id, u.email, u.username, u.is_premium, u.premium_tier,
        u.created_at, u.last_login,
        COUNT(t.id) as thread_count,
        COUNT(DISTINCT c.id) as collection_count,
        COUNT(DISTINCT tg.id) as tag_count
      FROM users u
      LEFT JOIN threads t ON u.id = t.user_id
      LEFT JOIN collections c ON u.id = c.user_id
      LEFT JOIN tags tg ON u.id = tg.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [req.user.userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = rows[0];
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      isPremium: user.is_premium,
      premiumTier: user.premium_tier,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      stats: {
        threadCount: parseInt(user.thread_count),
        collectionCount: parseInt(user.collection_count),
        tagCount: parseInt(user.tag_count)
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Profile fetch failed',
      message: 'Unable to get user profile'
    });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;