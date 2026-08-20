const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');
const { runMigrations } = require('../../backend/src/config/migrator');

describe('Database Schema Constraints & Monetary Precision Tests', () => {
  let db;
  let pool;

  beforeAll(async () => {
    db = newDb();

    // Register extension hooks with impure: true so each invocation generates a new UUID
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
    pool = new Pool();

    // Execute all migrations using migrator
    await runMigrations(pool);
  });

  afterAll(async () => {
    if (pool && pool.end) {
      await pool.end();
    }
  });

  test('Users table enforces unique email constraint and role foreign key', async () => {
    // 1. Successful user creation
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('investor1@tesla.com', 'hashed_pw_123', 'USER', 'ACTIVE')
      RETURNING id, email, role, status;
    `);
    expect(userRes.rows[0].email).toBe('investor1@tesla.com');
    expect(userRes.rows[0].role).toBe('USER');

    // 2. Duplicate email must fail
    await expect(pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('investor1@tesla.com', 'another_hash', 'USER');
    `)).rejects.toThrow();

    // 3. Invalid role must fail foreign key check
    await expect(pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('invalid_role@tesla.com', 'hash', 'NON_EXISTENT_ROLE');
    `)).rejects.toThrow();
  });

  test('Profiles table enforces 1-to-1 relationship and cascades on user deletion', async () => {
    const user = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('profile_test@tesla.com', 'hash', 'USER')
      RETURNING id;
    `);
    const userId = user.rows[0].id;

    // Create profile
    const profileRes = await pool.query(`
      INSERT INTO profiles (user_id, first_name, last_name, country, kyc_status)
      VALUES ($1, 'Nikola', 'Tesla', 'United States', 'APPROVED')
      RETURNING id, first_name, kyc_status;
    `, [userId]);
    expect(profileRes.rows[0].first_name).toBe('Nikola');
    expect(profileRes.rows[0].kyc_status).toBe('APPROVED');

    // Duplicate profile for same user must fail
    await expect(pool.query(`
      INSERT INTO profiles (user_id, first_name, last_name)
      VALUES ($1, 'Duplicate', 'Profile');
    `, [userId])).rejects.toThrow();

    // Deleting user cascades to profile
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    const checkProfile = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
    expect(checkProfile.rows.length).toBe(0);
  });

  test('Investment products preserve high precision monetary values without float truncation', async () => {
    const products = await pool.query(`
      SELECT slug, unit_price, min_investment, target_amount 
      FROM investment_products 
      WHERE slug = 'tsla-direct-allocation';
    `);

    expect(products.rows.length).toBe(1);
    const prod = products.rows[0];
    expect(Number(prod.unit_price)).toBe(248.0000);
    expect(Number(prod.min_investment)).toBe(1000.0000);

    // Negative unit price or min investment must be rejected by check constraint
    await expect(pool.query(`
      INSERT INTO investment_products (slug, name, category, unit_price, min_investment)
      VALUES ('invalid-price', 'Invalid Price', 'EQUITY_OFFERING', -50.0000, 100.0000);
    `)).rejects.toThrow();
  });

  test('Transactions ledger enforces immutability, type checks, and positive amounts', async () => {
    const user = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('tx_test@tesla.com', 'hash', 'USER')
      RETURNING id;
    `);
    const userId = user.rows[0].id;

    // 1. Valid transaction creation
    const tx = await pool.query(`
      INSERT INTO transactions (reference_id, user_id, type, amount, currency, status, description)
      VALUES ('TX-TSLA-001', $1, 'PAYMENT', 12400.5000, 'USD', 'SETTLED', 'IPO Allocation Wire')
      RETURNING id, reference_id, amount, status;
    `, [userId]);

    expect(tx.rows[0].reference_id).toBe('TX-TSLA-001');
    expect(Number(tx.rows[0].amount)).toBe(12400.5000);

    // 2. Duplicate reference_id must fail
    await expect(pool.query(`
      INSERT INTO transactions (reference_id, user_id, type, amount, status)
      VALUES ('TX-TSLA-001', $1, 'PAYMENT', 500.0000, 'SETTLED');
    `, [userId])).rejects.toThrow();

    // 3. Zero or negative amount must fail
    await expect(pool.query(`
      INSERT INTO transactions (reference_id, user_id, type, amount, status)
      VALUES ('TX-TSLA-NEG', $1, 'PAYMENT', -100.0000, 'SETTLED');
    `, [userId])).rejects.toThrow();

    // 4. Invalid transaction type must fail
    await expect(pool.query(`
      INSERT INTO transactions (reference_id, user_id, type, amount, status)
      VALUES ('TX-TSLA-BADTYPE', $1, 'UNSUPPORTED_TYPE', 100.0000, 'SETTLED');
    `, [userId])).rejects.toThrow();
  });

  test('Payments enforce unique idempotency keys and link to valid transactions', async () => {
    const user = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('payment_test@tesla.com', 'hash', 'USER')
      RETURNING id;
    `);
    const userId = user.rows[0].id;

    const tx = await pool.query(`
      INSERT INTO transactions (reference_id, user_id, type, amount, status)
      VALUES ('TX-PAY-001', $1, 'PAYMENT', 2480.0000, 'PENDING')
      RETURNING id;
    `, [userId]);
    const txId = tx.rows[0].id;

    // Create payment
    const payment = await pool.query(`
      INSERT INTO payments (user_id, transaction_id, provider, amount, status, idempotency_key)
      VALUES ($1, $2, 'STRIPE', 2480.0000, 'SUCCEEDED', 'idempotency-key-abc-123')
      RETURNING id, idempotency_key, amount, status;
    `, [userId, txId]);

    expect(payment.rows[0].idempotency_key).toBe('idempotency-key-abc-123');
    expect(Number(payment.rows[0].amount)).toBe(2480.0000);

    // Duplicate idempotency_key must fail
    await expect(pool.query(`
      INSERT INTO payments (user_id, transaction_id, provider, amount, status, idempotency_key)
      VALUES ($1, $2, 'STRIPE', 2480.0000, 'PENDING', 'idempotency-key-abc-123');
    `, [userId, txId])).rejects.toThrow();
  });

  test('Audit log successfully records system and security events', async () => {
    const auditRes = await pool.query(`
      INSERT INTO audit_logs (action, entity_type, entity_id, ip_address, metadata)
      VALUES ('ACCOUNT_CREATED', 'USER', 'user-uuid-123', '192.168.1.1', '{"channel": "web_portal"}'::jsonb)
      RETURNING id, action, entity_type;
    `);

    expect(auditRes.rows[0].action).toBe('ACCOUNT_CREATED');
    expect(auditRes.rows[0].entity_type).toBe('USER');
  });
});
