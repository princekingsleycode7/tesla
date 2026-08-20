const { getPool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Data Access Layer for Payments
 */
const paymentRepository = {
  /**
   * Creates a new payment record
   */
  async create(paymentData, client) {
    const db = client || getPool();
    const {
      userId,
      transactionId,
      provider = 'TESLA_PAY',
      providerPaymentId = null,
      providerSessionId = null,
      amount,
      currency = 'USD',
      status = 'PENDING',
      idempotencyKey,
      checkoutUrl = null,
      relatedInvestmentId = null,
      paymentMethodDetails = {},
      errorDetails = {},
      metadata = {}
    } = paymentData;

    const query = `
      INSERT INTO payments (
        user_id,
        transaction_id,
        provider,
        provider_payment_id,
        provider_session_id,
        amount,
        currency,
        status,
        idempotency_key,
        checkout_url,
        related_investment_id,
        payment_method_details,
        error_details,
        metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      RETURNING 
        id,
        user_id AS "userId",
        transaction_id AS "transactionId",
        provider,
        provider_payment_id AS "providerPaymentId",
        provider_session_id AS "providerSessionId",
        amount,
        currency,
        status,
        idempotency_key AS "idempotencyKey",
        checkout_url AS "checkoutUrl",
        related_investment_id AS "relatedInvestmentId",
        payment_method_details AS "paymentMethodDetails",
        error_details AS "errorDetails",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    const values = [
      userId,
      transactionId || null,
      provider,
      providerPaymentId,
      providerSessionId,
      amount,
      currency,
      status,
      idempotencyKey,
      checkoutUrl,
      relatedInvestmentId,
      JSON.stringify(paymentMethodDetails),
      JSON.stringify(errorDetails),
      JSON.stringify(metadata)
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  },

  /**
   * Finds a payment by primary UUID
   */
  async findById(id, client) {
    const db = client || getPool();
    const query = `
      SELECT 
        id,
        user_id AS "userId",
        transaction_id AS "transactionId",
        provider,
        provider_payment_id AS "providerPaymentId",
        provider_session_id AS "providerSessionId",
        amount,
        currency,
        status,
        idempotency_key AS "idempotencyKey",
        checkout_url AS "checkoutUrl",
        related_investment_id AS "relatedInvestmentId",
        payment_method_details AS "paymentMethodDetails",
        error_details AS "errorDetails",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments
      WHERE id = $1;
    `;

    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  },

  /**
   * Finds a payment by unique idempotency key
   */
  async findByIdempotencyKey(idempotencyKey, client) {
    const db = client || getPool();
    const query = `
      SELECT 
        id,
        user_id AS "userId",
        transaction_id AS "transactionId",
        provider,
        provider_payment_id AS "providerPaymentId",
        provider_session_id AS "providerSessionId",
        amount,
        currency,
        status,
        idempotency_key AS "idempotencyKey",
        checkout_url AS "checkoutUrl",
        related_investment_id AS "relatedInvestmentId",
        payment_method_details AS "paymentMethodDetails",
        error_details AS "errorDetails",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments
      WHERE idempotency_key = $1;
    `;

    const result = await db.query(query, [idempotencyKey]);
    return result.rows[0] || null;
  },

  /**
   * Finds a payment by provider transaction/payment ID
   */
  async findByProviderPaymentId(providerPaymentId, client) {
    const db = client || getPool();
    const query = `
      SELECT 
        id,
        user_id AS "userId",
        transaction_id AS "transactionId",
        provider,
        provider_payment_id AS "providerPaymentId",
        provider_session_id AS "providerSessionId",
        amount,
        currency,
        status,
        idempotency_key AS "idempotencyKey",
        checkout_url AS "checkoutUrl",
        related_investment_id AS "relatedInvestmentId",
        payment_method_details AS "paymentMethodDetails",
        error_details AS "errorDetails",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments
      WHERE provider_payment_id = $1;
    `;

    const result = await db.query(query, [providerPaymentId]);
    return result.rows[0] || null;
  },

  /**
   * Finds payments by user ID
   */
  async findByUserId(userId, options = {}, client) {
    const db = client || getPool();
    const { status, limit = 50, offset = 0 } = options;

    let query = `
      SELECT 
        id,
        user_id AS "userId",
        transaction_id AS "transactionId",
        provider,
        provider_payment_id AS "providerPaymentId",
        provider_session_id AS "providerSessionId",
        amount,
        currency,
        status,
        idempotency_key AS "idempotencyKey",
        checkout_url AS "checkoutUrl",
        related_investment_id AS "relatedInvestmentId",
        payment_method_details AS "paymentMethodDetails",
        error_details AS "errorDetails",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments
      WHERE user_id = $1
    `;

    const values = [userId];
    let idx = 2;

    if (status) {
      query += ` AND status = $${idx++}`;
      values.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++};`;
    values.push(limit, offset);

    const result = await db.query(query, values);
    return result.rows;
  },

  /**
   * Updates payment status and details atomically
   */
  async updateStatus(id, status, details = {}, client) {
    const db = client || getPool();
    const {
      providerPaymentId,
      providerSessionId,
      errorDetails,
      paymentMethodDetails,
      metadata
    } = details;

    const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [id, status];
    let idx = 3;

    if (providerPaymentId !== undefined) {
      updates.push(`provider_payment_id = $${idx++}`);
      values.push(providerPaymentId);
    }
    if (providerSessionId !== undefined) {
      updates.push(`provider_session_id = $${idx++}`);
      values.push(providerSessionId);
    }
    if (errorDetails !== undefined) {
      updates.push(`error_details = $${idx++}`);
      values.push(JSON.stringify(errorDetails));
    }
    if (paymentMethodDetails !== undefined) {
      updates.push(`payment_method_details = $${idx++}`);
      values.push(JSON.stringify(paymentMethodDetails));
    }
    if (metadata !== undefined) {
      updates.push(`metadata = $${idx++}`);
      values.push(JSON.stringify(metadata));
    }

    const query = `
      UPDATE payments
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING 
        id,
        user_id AS "userId",
        transaction_id AS "transactionId",
        provider,
        provider_payment_id AS "providerPaymentId",
        provider_session_id AS "providerSessionId",
        amount,
        currency,
        status,
        idempotency_key AS "idempotencyKey",
        checkout_url AS "checkoutUrl",
        related_investment_id AS "relatedInvestmentId",
        payment_method_details AS "paymentMethodDetails",
        error_details AS "errorDetails",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }
};

module.exports = paymentRepository;
