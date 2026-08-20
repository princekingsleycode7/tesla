const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

/**
 * Helmet Content-Security-Policy & Header configuration
 * Allows external fonts, CDN scripts, and video sources used by the landing page
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://cdn.tailwindcss.com",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://images.unsplash.com",
        "https://*.cloudfront.net"
      ],
      mediaSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://d8j0ntlcm91z4.cloudfront.net",
        "https://*.cloudfront.net"
      ],
      connectSrc: [
        "'self'",
        "https://*.googleapis.com",
        "https://*.google.com"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: env.isProduction ? [] : null
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

/**
 * CORS Configuration
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    if (env.isDevelopment || env.isTest) {
      return callback(null, true);
    }
    
    const allowedOrigins = [env.FRONTEND_URL].filter(Boolean);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

/**
 * API Rate Limiter
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.'
    }
  },
  skip: (req) => env.isTest
});

/**
 * Authentication Endpoints Strict Rate Limiter (Brute-force protection)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 authentication attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts from this IP, please try again in 15 minutes.'
    }
  },
  skip: (req) => env.isTest
});

module.exports = {
  securityHeaders,
  corsMiddleware: cors(corsOptions),
  apiLimiter,
  authLimiter
};
