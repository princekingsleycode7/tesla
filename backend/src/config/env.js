const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env if present
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-default-secret-do-not-use-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  isDevelopment: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,
};

/**
 * Validates essential environment configurations
 * @returns {{ valid: boolean, warnings: string[], errors: string[] }}
 */
function validateEnv() {
  const errors = [];
  const warnings = [];

  if (env.isProduction) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-default-secret-do-not-use-in-production') {
      errors.push('JWT_SECRET must be set to a secure key in production');
    }
    if (!process.env.DATABASE_URL) {
      warnings.push('DATABASE_URL is not configured; database queries will fail in production');
    }
  } else {
    if (!process.env.DATABASE_URL) {
      warnings.push('DATABASE_URL not set; running with deferred database connectivity');
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

module.exports = {
  env,
  validateEnv
};
