// src/server.js - Main server file for ThreadKeeper API

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'chrome-extension://*',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression middleware
app.use(compression());

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Limit requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/threads', require('./routes/threads'));
app.use('/api/v1/collections', require('./routes/collections'));
app.use('/api/v1/tags', require('./routes/tags'));
app.use('/api/v1/sync', require('./routes/sync'));
app.use('/api/v1/billing', require('./routes/billing'));
app.use('/api/v1/analytics', require('./routes/analytics'));

// API documentation
app.get('/api/v1/docs', (req, res) => {
  res.json({
    name: 'ThreadKeeper API',
    version: '1.0.0',
    description: 'API for ThreadKeeper - Twitter/X Thread Management',
    endpoints: {
      auth: {
        'POST /api/v1/auth/register': 'Register new user',
        'POST /api/v1/auth/login': 'User login',
        'POST /api/v1/auth/refresh': 'Refresh JWT token',
        'POST /api/v1/auth/logout': 'User logout',
        'GET /api/v1/auth/verify': 'Verify JWT token'
      },
      threads: {
        'GET /api/v1/threads': 'Get user threads',
        'POST /api/v1/threads': 'Save new thread',
        'GET /api/v1/threads/:id': 'Get specific thread',
        'PUT /api/v1/threads/:id': 'Update thread',
        'DELETE /api/v1/threads/:id': 'Delete thread',
        'POST /api/v1/threads/search': 'Search threads'
      },
      collections: {
        'GET /api/v1/collections': 'Get collections',
        'POST /api/v1/collections': 'Create collection',
        'PUT /api/v1/collections/:id': 'Update collection',
        'DELETE /api/v1/collections/:id': 'Delete collection'
      },
      tags: {
        'GET /api/v1/tags': 'Get tags',
        'POST /api/v1/tags': 'Create tag',
        'PUT /api/v1/tags/:id': 'Update tag',
        'DELETE /api/v1/tags/:id': 'Delete tag'
      },
      sync: {
        'POST /api/v1/sync/threads': 'Sync threads (Premium)',
        'GET /api/v1/sync/status': 'Get sync status'
      },
      billing: {
        'POST /api/v1/billing/create-subscription': 'Create subscription',
        'POST /api/v1/billing/cancel-subscription': 'Cancel subscription',
        'GET /api/v1/billing/subscription-status': 'Get subscription status'
      }
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `API endpoint ${req.method} ${req.path} not found`,
    documentation: '/api/v1/docs'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Default error response
  let error = {
    message: 'Internal Server Error',
    status: 500
  };
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    error.message = err.message;
    error.status = 400;
    error.details = err.details;
  } else if (err.name === 'UnauthorizedError') {
    error.message = 'Authentication required';
    error.status = 401;
  } else if (err.code === '23505') { // PostgreSQL unique constraint
    error.message = 'Resource already exists';
    error.status = 409;
  } else if (err.code === '23503') { // PostgreSQL foreign key constraint
    error.message = 'Referenced resource not found';
    error.status = 400;
  }
  
  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && error.status === 500) {
    error.message = 'Internal Server Error';
    delete error.details;
  }
  
  res.status(error.status).json({
    error: error.message,
    ...(error.details && { details: error.details })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 ThreadKeeper API server running on port ${PORT}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}/api/v1/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;