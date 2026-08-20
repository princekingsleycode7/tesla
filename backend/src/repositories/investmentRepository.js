const { query } = require('../config/database');

/**
 * User Investment Data Access Repository
 */
const investmentRepository = {
  /**
   * Creates a new user investment record
   * @param {Object} data
   * @param {import('pg').PoolClient} [client]
   */
  async create(data, client = null) {
    const sql = `
      INSERT INTO user_investments (
        user_id,
        product_id,
        units,
        price_per_unit,
        total_amount,
        currency,
        status,
        start_date,
        maturity_date,
        expected_return_amount,
        expected_total_payout,
        return_rate,
        certificate_id,
        idempotency_key,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING 
        id,
        user_id AS "userId",
        product_id AS "productId",
        units,
        price_per_unit AS "pricePerUnit",
        total_amount AS "totalAmount",
        currency,
        status,
        start_date AS "startDate",
        maturity_date AS "maturityDate",
        expected_return_amount AS "expectedReturnAmount",
        expected_total_payout AS "expectedTotalPayout",
        return_rate AS "returnRate",
        certificate_id AS "certificateId",
        idempotency_key AS "idempotencyKey",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const params = [
      data.userId,
      data.productId,
      data.units,
      data.pricePerUnit,
      data.totalAmount,
      data.currency || 'USD',
      data.status || 'CONFIRMED',
      data.startDate || new Date(),
      data.maturityDate || null,
      data.expectedReturnAmount || 0,
      data.expectedTotalPayout || data.totalAmount,
      data.returnRate || 0,
      data.certificateId || null,
      data.idempotencyKey || null,
      JSON.stringify(data.metadata || {})
    ];

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows[0];
  },

  /**
   * Retrieves an investment by ID with associated plan information
   * @param {string} id
   * @param {import('pg').PoolClient} [client]
   */
  async findById(id, client = null) {
    const sql = `
      SELECT 
        i.id,
        i.user_id AS "userId",
        i.product_id AS "productId",
        i.units,
        i.price_per_unit AS "pricePerUnit",
        i.total_amount AS "totalAmount",
        i.currency,
        i.status,
        i.start_date AS "startDate",
        i.maturity_date AS "maturityDate",
        i.expected_return_amount AS "expectedReturnAmount",
        i.expected_total_payout AS "expectedTotalPayout",
        i.return_rate AS "returnRate",
        i.certificate_id AS "certificateId",
        i.idempotency_key AS "idempotencyKey",
        i.metadata,
        i.created_at AS "createdAt",
        i.updated_at AS "updatedAt",
        p.slug AS "planSlug",
        p.name AS "planName",
        p.ticker AS "planTicker",
        p.category AS "planCategory",
        p.duration_months AS "planDurationMonths",
        p.return_type AS "planReturnType",
        p.payout_frequency AS "planPayoutFrequency"
      FROM user_investments i
      JOIN investment_products p ON i.product_id = p.id
      WHERE i.id = $1
    `;
    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [id]);
    return result.rows[0] || null;
  },

  /**
   * Retrieves an investment by idempotency key
   * @param {string} idempotencyKey
   * @param {string} [userId]
   * @param {import('pg').PoolClient} [client]
   */
  async findByIdempotencyKey(idempotencyKey, userId = null, client = null) {
    let sql = `
      SELECT 
        i.id,
        i.user_id AS "userId",
        i.product_id AS "productId",
        i.units,
        i.price_per_unit AS "pricePerUnit",
        i.total_amount AS "totalAmount",
        i.currency,
        i.status,
        i.start_date AS "startDate",
        i.maturity_date AS "maturityDate",
        i.expected_return_amount AS "expectedReturnAmount",
        i.expected_total_payout AS "expectedTotalPayout",
        i.return_rate AS "returnRate",
        i.certificate_id AS "certificateId",
        i.idempotency_key AS "idempotencyKey",
        i.metadata,
        i.created_at AS "createdAt",
        i.updated_at AS "updatedAt",
        p.slug AS "planSlug",
        p.name AS "planName",
        p.ticker AS "planTicker",
        p.category AS "planCategory",
        p.duration_months AS "planDurationMonths",
        p.return_type AS "planReturnType",
        p.payout_frequency AS "planPayoutFrequency"
      FROM user_investments i
      JOIN investment_products p ON i.product_id = p.id
      WHERE i.idempotency_key = $1
    `;
    const params = [idempotencyKey];
    if (userId) {
      sql += ` AND i.user_id = $2`;
      params.push(userId);
    }

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows[0] || null;
  },

  /**
   * Retrieves all investments belonging to a user
   * @param {string} userId
   * @param {Object} [options]
   * @param {string} [options.status]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {import('pg').PoolClient} [client]
   */
  async findByUserId(userId, { status, limit = 50, offset = 0 } = {}, client = null) {
    const conditions = ['i.user_id = $1'];
    const params = [userId];

    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }

    params.push(limit, offset);
    const sql = `
      SELECT 
        i.id,
        i.user_id AS "userId",
        i.product_id AS "productId",
        i.units,
        i.price_per_unit AS "pricePerUnit",
        i.total_amount AS "totalAmount",
        i.currency,
        i.status,
        i.start_date AS "startDate",
        i.maturity_date AS "maturityDate",
        i.expected_return_amount AS "expectedReturnAmount",
        i.expected_total_payout AS "expectedTotalPayout",
        i.return_rate AS "returnRate",
        i.certificate_id AS "certificateId",
        i.idempotency_key AS "idempotencyKey",
        i.metadata,
        i.created_at AS "createdAt",
        i.updated_at AS "updatedAt",
        p.slug AS "planSlug",
        p.name AS "planName",
        p.ticker AS "planTicker",
        p.category AS "planCategory",
        p.duration_months AS "planDurationMonths",
        p.return_type AS "planReturnType",
        p.payout_frequency AS "planPayoutFrequency"
      FROM user_investments i
      JOIN investment_products p ON i.product_id = p.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows;
  },

  /**
   * Retrieves a summary of a user's investments portfolio
   * @param {string} userId
   * @param {import('pg').PoolClient} [client]
   */
  async getUserSummary(userId, client = null) {
    const sql = `
      SELECT 
        COUNT(*)::int AS "totalCount",
        COUNT(CASE WHEN status IN ('CONFIRMED', 'ACTIVE', 'ALLOCATED') THEN 1 END)::int AS "activeCount",
        COALESCE(SUM(CASE WHEN status IN ('CONFIRMED', 'ACTIVE', 'ALLOCATED') THEN total_amount ELSE 0 END), 0) AS "totalInvestedAmount",
        COALESCE(SUM(CASE WHEN status IN ('CONFIRMED', 'ACTIVE', 'ALLOCATED') THEN expected_return_amount ELSE 0 END), 0) AS "totalProjectedReturns",
        COALESCE(SUM(CASE WHEN status IN ('CONFIRMED', 'ACTIVE', 'ALLOCATED') THEN expected_total_payout ELSE 0 END), 0) AS "totalProjectedPayout"
      FROM user_investments
      WHERE user_id = $1
    `;
    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [userId]);
    return result.rows[0];
  }
};

module.exports = investmentRepository;
