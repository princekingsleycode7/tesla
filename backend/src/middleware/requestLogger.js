const morgan = require('morgan');
const { env } = require('../config/env');

// Morgan stream configuration
const stream = {
  write: (message) => {
    if (!env.isTest) {
      process.stdout.write(message);
    }
  }
};

// Formats: 'combined' in production, 'dev' in development
const format = env.isProduction ? 'combined' : 'dev';

const requestLogger = morgan(format, {
  stream,
  skip: (req) => env.isTest || req.url === '/api/v1/health'
});

module.exports = requestLogger;
