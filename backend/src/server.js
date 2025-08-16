// backend/src/server.js - Main Express Server

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const threadRoutes = require('./routes/threads');
const collectionRoutes = require('./routes/collections');
const tagRoutes = require('./routes/tags');
const billingRoutes = require('./routes/billing');
const syncRoutes = require('./routes/sync');
const analyticsRoutes = require('./routes/analytics');

// Import services
const { initializeDatabase } = require('./config/database');
const { initializeStripe } = require('./config/stripe');
const logger = require('./utils/logger');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'chrome-extension://*',
      'http://localhost:3000',
      'https://threadkeeper.app'
    ];
    
    // Allow requests with no origin (like mobile apps)
    if (!origin) return callback(null, true);
    
    // Check if origin matches pattern
    const isAllowed = allowedOrigins.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(origin);
      }
      return pattern === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', { stream: logger.stream }));
} else {
  app.use(morgan('dev'));
}

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', globalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/threads', authenticateToken, threadRoutes);
app.use('/api/v1/collections', authenticateToken, collectionRoutes);
app.use('/api/v1/tags', authenticateToken, tagRoutes);
app.use('/api/v1/billing', authenticateToken, billingRoutes);
app.use('/api/v1/sync', authenticateToken, syncRoutes);
app.use('/api/v1/analytics', authenticateToken, analyticsRoutes);

// Static files for web dashboard (if needed)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('public'));
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested resource does not exist',
    path: req.originalUrl
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

let server;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized successfully');
    
    // Initialize Stripe
    await initializeStripe();
    logger.info('Stripe initialized successfully');
    
    // Start server
    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

function gracefulShutdown() {
  logger.info('Graceful shutdown initiated');
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      
      // Close database connections
      require('./config/database').closeConnection()
        .then(() => {
          logger.info('Database connections closed');
          process.exit(0);
        })
        .catch((err) => {
          logger.error('Error closing database connections:', err);
          process.exit(1);
        });
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  }
}

// Start the server
startServer();

module.exports = app;