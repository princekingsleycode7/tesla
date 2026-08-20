const { Pool } = require('pg');
const { env } = require('./env');
const logger = require('../utils/logger');

let pool = null;

/**
 * Initializes and retrieves the PostgreSQL connection pool
 * @returns {Pool|null}
 */
function getPool() {
  if (!pool && env.DATABASE_URL) {
    const isLocalhost = env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1');
    
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
    });
  }
  return pool;
}

/**
 * Explicitly sets the active connection pool (e.g. for testing)
 * @param {Pool} customPool
 */
function setPool(customPool) {
  pool = customPool;
}

/**
 * Executes a SQL query using the connection pool
 * @param {string} text 
 * @param {Array} [params] 
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('Database connection pool is not configured (missing DATABASE_URL)');
  }
  
  const start = Date.now();
  try {
    const result = await activePool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed SQL query', { text, duration, rowCount: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Database query execution error', { text, error: error.message });
    throw error;
  }
}

/**
 * Checks connectivity to the database
 * @returns {Promise<{ connected: boolean, latencyMs?: number, message?: string }>}
 */
async function checkConnection() {
  const activePool = getPool();
  if (!activePool) {
    return {
      connected: false,
      message: 'DATABASE_URL not configured'
    };
  }

  const start = Date.now();
  try {
    const res = await activePool.query('SELECT 1 AS health_check');
    const latencyMs = Date.now() - start;
    return {
      connected: res.rows && res.rows[0]?.health_check === 1,
      latencyMs
    };
  } catch (error) {
    return {
      connected: false,
      message: error.message
    };
  }
}

/**
 * Acquires a client from the connection pool
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('Database connection pool is not configured (missing DATABASE_URL)');
  }
  return activePool.connect();
}

/**
 * Executes a callback within a database transaction with automatic BEGIN, COMMIT, and ROLLBACK
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function withTransaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Transaction rollback failed', { error: rollbackError.message });
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Closes the connection pool gracefully
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed successfully');
  }
}

module.exports = {
  getPool,
  setPool,
  getClient,
  withTransaction,
  query,
  checkConnection,
  closePool
};
