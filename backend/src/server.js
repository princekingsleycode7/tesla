const app = require('./app');
const { env, validateEnv } = require('./config/env');
const { checkConnection, closePool } = require('./config/database');
const logger = require('./utils/logger');

let server = null;

async function startServer(port = env.PORT || 3000) {
  // Validate environment variables
  const envValidation = validateEnv();
  if (!envValidation.valid) {
    logger.error('Environment validation failed:', { errors: envValidation.errors });
    if (env.isProduction) {
      process.exit(1);
    }
  }

  if (envValidation.warnings.length > 0) {
    envValidation.warnings.forEach((warning) => logger.warn(warning));
  }

  // Attempt database connectivity check (non-blocking in dev/test)
  if (env.DATABASE_URL) {
    const dbStatus = await checkConnection();
    if (dbStatus.connected) {
      logger.info('Database connection established successfully', { latencyMs: dbStatus.latencyMs });
    } else {
      logger.warn('Database connection check failed or pending configuration', { message: dbStatus.message });
    }
  } else {
    logger.info('Database configuration deferred (DATABASE_URL not set)');
  }

  // Start Express HTTP Server and resolve once listening
  return new Promise((resolve, reject) => {
    server = app.listen(port, '0.0.0.0', () => {
      logger.info(`Tesla Full-Stack Server running on port ${port} [${env.NODE_ENV}]`);
      resolve(server);
    });
    server.on('error', (err) => {
      logger.error('Server listen error', { error: err.message });
      reject(err);
    });
  });
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await closePool();
      } catch (err) {
        logger.error('Error closing database pool during shutdown', { error: err.message });
      }
      process.exit(0);
    });

    // Force shutdown if taking longer than 10 seconds
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server if executed directly
if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Fatal server startup error', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = {
  startServer,
  app
};
