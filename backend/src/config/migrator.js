const fs = require('fs');
const path = require('path');
const { getPool } = require('./database');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

/**
 * Ensures schema_migrations tracking table exists.
 */
async function ensureMigrationsTable(pool) {
  try {
    const checkRes = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'schema_migrations'
    `);

    if (!checkRes.rows || checkRes.rows.length === 0) {
      await pool.query(`
        CREATE TABLE schema_migrations (
          id SERIAL PRIMARY KEY,
          version VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
  } catch {
    // Fallback standard creation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
}

/**
 * Runs all pending database migrations in sequential order.
 * @param {object} [customPool] - Optional database pool or adapter (useful for testing)
 * @returns {Promise<{ executed: string[], total: number }>}
 */
async function runMigrations(customPool = null) {
  const pool = customPool || getPool();
  if (!pool) {
    throw new Error('Database pool not available for running migrations');
  }

  // Ensure schema_migrations table exists
  await ensureMigrationsTable(pool);

  // Fetch already applied migrations
  const appliedResult = await pool.query('SELECT version FROM schema_migrations ORDER BY id ASC');
  const appliedSet = new Set(appliedResult.rows.map((row) => row.version));

  // Read all .sql migration files in alphabetical order
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const executed = [];

  for (const file of files) {
    const version = path.basename(file, '.sql');
    if (!appliedSet.has(version)) {
      logger.info(`Applying migration: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      // Execute each migration inside a dedicated client transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sqlContent);
        // Ensure migration is recorded
        await client.query(
          `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
          [version]
        );
        await client.query('COMMIT');
        logger.info(`Successfully applied migration: ${file}`);
        executed.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Failed to apply migration ${file}:`, { error: err.message });
        throw err;
      } finally {
        client.release();
      }
    }
  }

  return {
    executed,
    total: files.length
  };
}

module.exports = {
  runMigrations,
  ensureMigrationsTable,
  MIGRATIONS_DIR
};
