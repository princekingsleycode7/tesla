const { query } = require('../config/database');

/**
 * Transactions Ledger Data Access Repository
 */
const transactionRepository = {
  /**
   * Creates a new financial transaction record
   * @param {Object} data
   * @param {import('pg').PoolClient} [client]
   */
  async create(data, client = null) {
    const sql = `
      INSERT INTO transactions (
        reference_id,
        user_id,
        type,
        amount,
        currency,
        status,
        description,
        related_investment_id,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id,
        reference_id AS "referenceId",
        user_id AS "userId",
        type,
        amount,
        currency,
        status,
        description,
        related_investment_id AS "relatedInvestmentId",
        metadata,
        created_at AS "createdAt"
    `;

    const params = [
      data.referenceId,
      data.userId,
      data.type,
      data.amount,
      data.currency || 'USD',
      data.status || 'SETTLED',
      data.description || null,
      data.relatedInvestmentId || null,
      JSON.stringify(data.metadata || {})
    ];

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows[0];
  },

  /**
   * Retrieves transactions for a user
   * @param {string} userId
   * @param {Object} [options]
   * @param {string} [options.type]
   * @param {string} [options.status]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {import('pg').PoolClient} [client]
   */
  async findByUserId(userId, { type, status, limit = 50, offset = 0 } = {}, client = null) {
    const conditions = ['user_id = $1'];
    const params = [userId];

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(limit, offset);
    const sql = `
      SELECT 
        id,
        reference_id AS "referenceId",
        user_id AS "userId",
        type,
        amount,
        currency,
        status,
        description,
        related_investment_id AS "relatedInvestmentId",
        metadata,
        created_at AS "createdAt"
      FROM transactions
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows;
  },

  /**
   * Retrieves transactions associated with a specific investment ID
   * @param {string} investmentId
   * @param {import('pg').PoolClient} [client]
   */
  async findByInvestmentId(investmentId, client = null) {
    const sql = `
      SELECT 
        id,
        reference_id AS "referenceId",
        user_id AS "userId",
        type,
        amount,
        currency,
        status,
        description,
        related_investment_id AS "relatedInvestmentId",
        metadata,
        created_at AS "createdAt"
      FROM transactions
      WHERE related_investment_id = $1
      ORDER BY created_at DESC
    `;

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [investmentId]);
    return result.rows;
  },

  /**
   * Retrieves a transaction by reference ID
   * @param {string} referenceId
   * @param {import('pg').PoolClient} [client]
   */
  async findByReferenceId(referenceId, client = null) {
    const sql = `
      SELECT 
        id,
        reference_id AS "referenceId",
        user_id AS "userId",
        type,
        amount,
        currency,
        status,
        description,
        related_investment_id AS "relatedInvestmentId",
        metadata,
        created_at AS "createdAt"
      FROM transactions
      WHERE reference_id = $1
    `;

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [referenceId]);
    return result.rows[0] || null;
  },

  /**
   * Updates status and metadata of a transaction
   * @param {string} id
   * @param {string} status
   * @param {Object} [metadata]
   * @param {import('pg').PoolClient} [client]
   */
  async updateStatus(id, status, metadata = {}, client = null) {
    const db = client || getPool();

    if (metadata && Object.keys(metadata).length > 0) {
      const getSql = `SELECT metadata FROM transactions WHERE id = $1`;
      const currentRes = await db.query(getSql, [id]);
      const currentMeta = currentRes.rows[0]?.metadata || {};
      const mergedMeta = { ...currentMeta, ...metadata };

      const sql = `
        UPDATE transactions
        SET status = $2,
            metadata = $3
        WHERE id = $1
        RETURNING 
          id,
          reference_id AS "referenceId",
          user_id AS "userId",
          type,
          amount,
          currency,
          status,
          description,
          related_investment_id AS "relatedInvestmentId",
          metadata,
          created_at AS "createdAt"
      `;

      const result = await db.query(sql, [id, status, JSON.stringify(mergedMeta)]);
      return result.rows[0] || null;
    } else {
      const sql = `
        UPDATE transactions
        SET status = $2
        WHERE id = $1
        RETURNING 
          id,
          reference_id AS "referenceId",
          user_id AS "userId",
          type,
          amount,
          currency,
          status,
          description,
          related_investment_id AS "relatedInvestmentId",
          metadata,
          created_at AS "createdAt"
      `;

      const result = await db.query(sql, [id, status]);
      return result.rows[0] || null;
    }
  },

  /**
   * Links an investment ID to a transaction
   * @param {string} transactionId
   * @param {string} investmentId
   * @param {import('pg').PoolClient} [client]
   */
  async linkInvestment(transactionId, investmentId, client = null) {
    const sql = `
      UPDATE transactions
      SET related_investment_id = $2
      WHERE id = $1
      RETURNING id, related_investment_id AS "relatedInvestmentId"
    `;

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [transactionId, investmentId]);
    return result.rows[0] || null;
  },

  /**
   * Counts transactions for a user
   * @param {string} userId
   * @param {Object} [options]
   * @param {string} [options.type]
   * @param {string} [options.status]
   * @param {import('pg').PoolClient} [client]
   */
  async countByUserId(userId, { type, status } = {}, client = null) {
    const conditions = ['user_id = $1'];
    const params = [userId];

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const sql = `
      SELECT COUNT(*)::int AS count
      FROM transactions
      WHERE ${conditions.join(' AND ')};
    `;

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows[0]?.count || 0;
  }
};

module.exports = transactionRepository;
