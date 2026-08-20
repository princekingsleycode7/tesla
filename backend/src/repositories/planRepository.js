const { query } = require('../config/database');

/**
 * Plan / Product Data Access Repository
 */
const planRepository = {
  /**
   * Retrieves all investment products/plans with optional filtering
   * @param {Object} [options]
   * @param {string} [options.status]
   * @param {string} [options.category]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {import('pg').PoolClient} [client]
   */
  async findAll({ status, category, limit = 50, offset = 0 } = {}, client = null) {
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    const sql = `
      SELECT 
        id,
        slug,
        name,
        ticker,
        category,
        description,
        unit_price AS "unitPrice",
        min_investment AS "minInvestment",
        max_investment AS "maxInvestment",
        target_amount AS "targetAmount",
        total_raised AS "totalRaised",
        currency,
        status,
        duration_months AS "durationMonths",
        duration_days AS "durationDays",
        expected_roi_percentage AS "expectedRoiPercentage",
        return_type AS "returnType",
        payout_frequency AS "payoutFrequency",
        offering_start_date AS "offeringStartDate",
        offering_end_date AS "offeringEndDate",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM investment_products
      ${whereClause}
      ORDER BY created_at ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows;
  },

  /**
   * Retrieves a plan by ID
   * @param {string} id
   * @param {import('pg').PoolClient} [client]
   */
  async findById(id, client = null) {
    const sql = `
      SELECT 
        id,
        slug,
        name,
        ticker,
        category,
        description,
        unit_price AS "unitPrice",
        min_investment AS "minInvestment",
        max_investment AS "maxInvestment",
        target_amount AS "targetAmount",
        total_raised AS "totalRaised",
        currency,
        status,
        duration_months AS "durationMonths",
        duration_days AS "durationDays",
        expected_roi_percentage AS "expectedRoiPercentage",
        return_type AS "returnType",
        payout_frequency AS "payoutFrequency",
        offering_start_date AS "offeringStartDate",
        offering_end_date AS "offeringEndDate",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM investment_products
      WHERE id = $1
    `;
    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [id]);
    return result.rows[0] || null;
  },

  /**
   * Retrieves a plan by slug
   * @param {string} slug
   * @param {import('pg').PoolClient} [client]
   */
  async findBySlug(slug, client = null) {
    const sql = `
      SELECT 
        id,
        slug,
        name,
        ticker,
        category,
        description,
        unit_price AS "unitPrice",
        min_investment AS "minInvestment",
        max_investment AS "maxInvestment",
        target_amount AS "targetAmount",
        total_raised AS "totalRaised",
        currency,
        status,
        duration_months AS "durationMonths",
        duration_days AS "durationDays",
        expected_roi_percentage AS "expectedRoiPercentage",
        return_type AS "returnType",
        payout_frequency AS "payoutFrequency",
        offering_start_date AS "offeringStartDate",
        offering_end_date AS "offeringEndDate",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM investment_products
      WHERE slug = $1
    `;
    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [slug]);
    return result.rows[0] || null;
  },

  /**
   * Retrieves a plan by either UUID or slug
   * @param {string} idOrSlug
   * @param {import('pg').PoolClient} [client]
   */
  async findByIdOrSlug(idOrSlug, client = null) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrSlug);
    if (isUuid) {
      return this.findById(idOrSlug, client);
    }
    return this.findBySlug(idOrSlug, client);
  },

  /**
   * Atomically increments the total raised for a plan
   * @param {string} id
   * @param {number|string} amount
   * @param {import('pg').PoolClient} [client]
   */
  async incrementTotalRaised(id, amount, client = null) {
    const sql = `
      UPDATE investment_products
      SET 
        total_raised = total_raised + $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING total_raised AS "totalRaised"
    `;
    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, [id, amount]);
    return result.rows[0] || null;
  },

  /**
   * Creates a new investment product/plan
   * @param {Object} planData
   * @param {import('pg').PoolClient} [client]
   */
  async create(planData, client = null) {
    const sql = `
      INSERT INTO investment_products (
        slug,
        name,
        ticker,
        category,
        description,
        unit_price,
        min_investment,
        max_investment,
        target_amount,
        currency,
        status,
        duration_months,
        duration_days,
        expected_roi_percentage,
        return_type,
        payout_frequency,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING 
        id,
        slug,
        name,
        ticker,
        category,
        description,
        unit_price AS "unitPrice",
        min_investment AS "minInvestment",
        max_investment AS "maxInvestment",
        target_amount AS "targetAmount",
        total_raised AS "totalRaised",
        currency,
        status,
        duration_months AS "durationMonths",
        duration_days AS "durationDays",
        expected_roi_percentage AS "expectedRoiPercentage",
        return_type AS "returnType",
        payout_frequency AS "payoutFrequency",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const params = [
      planData.slug,
      planData.name,
      planData.ticker || null,
      planData.category,
      planData.description || null,
      planData.unitPrice,
      planData.minInvestment,
      planData.maxInvestment || null,
      planData.targetAmount || null,
      planData.currency || 'USD',
      planData.status || 'ACTIVE',
      planData.durationMonths || 0,
      planData.durationDays || 0,
      planData.expectedRoiPercentage || 0,
      planData.returnType || 'CAPITAL_APPRECIATION',
      planData.payoutFrequency || 'AT_MATURITY',
      JSON.stringify(planData.metadata || {})
    ];

    const runner = client ? client.query.bind(client) : query;
    const result = await runner(sql, params);
    return result.rows[0];
  }
};

module.exports = planRepository;
