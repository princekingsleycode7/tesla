const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');
const { runMigrations } = require('../../backend/src/config/migrator');
const { setPool } = require('../../backend/src/config/database');

/**
 * Creates and sets up an isolated in-memory PostgreSQL instance for testing.
 * @returns {Promise<{ db: any, pool: any, cleanup: () => Promise<void> }>}
 */
async function setupTestDb() {
  const db = newDb();

  // Register UUID functions
  db.registerExtension('uuid-ossp', (schema) => {
    schema.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      impure: true,
      implementation: () => crypto.randomUUID()
    });
  });

  db.registerExtension('pgcrypto', (schema) => {
    schema.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      impure: true,
      implementation: () => crypto.randomUUID()
    });
  });

  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID()
  });

  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID()
  });

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  // Run all migrations
  await runMigrations(pool);

  // Set the global pool in database config
  setPool(pool);

  return {
    db,
    pool,
    cleanup: async () => {
      if (pool && pool.end) {
        await pool.end();
      }
    }
  };
}

module.exports = {
  setupTestDb
};
