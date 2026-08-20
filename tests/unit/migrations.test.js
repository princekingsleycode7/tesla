const crypto = require('crypto');
const { newDb } = require('pg-mem');
const { runMigrations } = require('../../backend/src/config/migrator');

describe('PostgreSQL Database Migrations Suite', () => {
  let db;
  let pool;

  beforeEach(() => {
    db = newDb();
    
    // Register extensions for pg-mem using real crypto.randomUUID
    db.registerExtension('uuid-ossp', (schema) => {
      schema.registerFunction({
        name: 'uuid_generate_v4',
        implementation: () => crypto.randomUUID()
      });
    });

    db.registerExtension('pgcrypto', (schema) => {
      schema.registerFunction({
        name: 'gen_random_uuid',
        implementation: () => crypto.randomUUID()
      });
    });

    db.public.registerFunction({
      name: 'gen_random_uuid',
      implementation: () => crypto.randomUUID()
    });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      implementation: () => crypto.randomUUID()
    });

    const { Pool } = db.adapters.createPg();
    pool = new Pool();
  });

  afterEach(async () => {
    if (pool && pool.end) {
      await pool.end();
    }
  });

  test('All migrations execute successfully from an empty database in sequence using migration runner', async () => {
    const result = await runMigrations(pool);
    expect(result.executed.length).toBeGreaterThanOrEqual(6);
    expect(result.total).toBeGreaterThanOrEqual(6);

    // Verify schema_migrations has recorded all migrations
    const recorded = await pool.query('SELECT version FROM schema_migrations ORDER BY id ASC');
    expect(recorded.rows.length).toBe(result.total);
  });

  test('Re-running migrations is idempotent and skips already applied migrations', async () => {
    // First run
    const firstRun = await runMigrations(pool);
    expect(firstRun.executed.length).toBeGreaterThanOrEqual(6);

    // Second run
    const secondRun = await runMigrations(pool);
    expect(secondRun.executed.length).toBe(0);
    expect(secondRun.total).toBe(firstRun.total);
  });
});
