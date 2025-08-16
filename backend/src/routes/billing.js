// src/routes/billing.js - Billing and subscription routes

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

// GET /api/v1/billing/subscription-status
router.get('/subscription-status', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT is_premium, premium_tier, stripe_customer_id, stripe_subscription_id, created_at
      FROM users WHERE id = $1
    `, [req.user.userId]);
    
    const user = rows[0];
    
    res.json({
      isPremium: user.is_premium,
      tier: user.premium_tier,
      customerId: user.stripe_customer_id,
      subscriptionId: user.stripe_subscription_id,
      memberSince: user.created_at
    });
    
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// POST /api/v1/billing/create-subscription
router.post('/create-subscription', async (req, res) => {
  try {
    // This would integrate with Stripe
    // For now, return a placeholder response
    res.json({ 
      message: 'Stripe integration not implemented yet',
      redirectUrl: 'https://threadkeeper.app/upgrade'
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// POST /api/v1/billing/cancel-subscription
router.post('/cancel-subscription', async (req, res) => {
  try {
    // This would integrate with Stripe
    res.json({ 
      message: 'Subscription cancellation not implemented yet'
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;