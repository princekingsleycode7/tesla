#!/usr/bin/env node
/**
 * CLI Migration Runner Script
 */
const { runMigrations } = require('../backend/src/config/migrator');
const { closePool } = require('../backend/src/config/database');
const logger = require('../backend/src/utils/logger');

async function main() {
  try {
    logger.info('Starting database migrations...');
    const result = await runMigrations();
    logger.info(`Migrations finished. ${result.executed.length} new migration(s) applied out of ${result.total} total.`);
    await closePool();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', { error: error.message, stack: error.stack });
    await closePool();
    process.exit(1);
  }
}

main();
