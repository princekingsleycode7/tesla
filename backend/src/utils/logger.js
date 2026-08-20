/**
 * Structured application logger
 */
const { env } = require('../config/env');

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  return {
    timestamp,
    level,
    message,
    ...(Object.keys(meta).length > 0 ? { meta } : {})
  };
}

const logger = {
  debug: (message, meta) => {
    if (env.isDevelopment || process.env.DEBUG) {
      console.debug(JSON.stringify(formatMessage(LOG_LEVELS.DEBUG, message, meta)));
    }
  },
  info: (message, meta) => {
    if (!env.isTest) {
      console.log(JSON.stringify(formatMessage(LOG_LEVELS.INFO, message, meta)));
    }
  },
  warn: (message, meta) => {
    console.warn(JSON.stringify(formatMessage(LOG_LEVELS.WARN, message, meta)));
  },
  error: (message, meta) => {
    console.error(JSON.stringify(formatMessage(LOG_LEVELS.ERROR, message, meta)));
  }
};

module.exports = logger;
