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
      metadata = {},
      paymentCurrency = null,
      cryptoCurrency = null,
      network = null,
      cryptoAmount = null,
      fiatAmount = null,
      transactionHash = null,
      paymentAddress = null,
      confirmationCount = 0,
      expiration = null,
      providerMetadata = {}
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
        metadata,
        payment_currency,
        crypto_currency,
        network,
        crypto_amount,
        fiat_amount,
        transaction_hash,
        payment_address,
        confirmation_count,
        expiration,
        provider_metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
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
        payment_currency AS "paymentCurrency",
        crypto_currency AS "cryptoCurrency",
        network,
        crypto_amount AS "cryptoAmount",
        fiat_amount AS "fiatAmount",
        transaction_hash AS "transactionHash",
        payment_address AS "paymentAddress",
        confirmation_count AS "confirmationCount",
        expiration,
        provider_metadata AS "providerMetadata",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const values = [
      userId || null,
      transactionId || null,
      provider || null,
      providerPaymentId || null,
      providerSessionId || null,
      amount,
      currency || 'USD',
      status || 'PENDING',
      idempotencyKey || null,
      checkoutUrl || null,
      relatedInvestmentId || null,
      JSON.stringify(paymentMethodDetails || {}),
      JSON.stringify(errorDetails || {}),
      JSON.stringify(metadata || {}),
      paymentCurrency || null,
      cryptoCurrency || null,
      network || null,
      cryptoAmount || null,
      fiatAmount || amount || null,
      transactionHash || null,
      paymentAddress || null,
      confirmationCount || 0,
      expiration || null,
      JSON.stringify(providerMetadata || {})
    ];

    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (err) {
      logger.error('Failed to create payment record in database:', { error: err.message });
      throw err;
    }
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
        payment_currency AS "paymentCurrency",
        crypto_currency AS "cryptoCurrency",
        network,
        crypto_amount AS "cryptoAmount",
        fiat_amount AS "fiatAmount",
        transaction_hash AS "transactionHash",
        payment_address AS "paymentAddress",
        confirmation_count AS "confirmationCount",
        expiration,
        provider_metadata AS "providerMetadata",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments
      WHERE id = $1
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
        payment_currency AS "paymentCurrency",
        crypto_currency AS "cryptoCurrency",
        network,
        crypto_amount AS "cryptoAmount",
        fiat_amount AS "fiatAmount",
        transaction_hash AS "transactionHash",
        payment_address AS "paymentAddress",
        confirmation_count AS "confirmationCount",
        expiration,
        provider_metadata AS "providerMetadata",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments
      WHERE idempotency_key = $1
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
        payment_currency AS "paymentCurrency",
        crypto_currency AS "cryptoCurrency",
        network,
        crypto_amount AS "cryptoAmount",
        fiat_amount AS "fiatAmount",
        transaction_hash AS "transactionHash",
        payment_address AS "paymentAddress",
        confirmation_count AS "confirmationCount",
        expiration,
        provider_metadata AS "providerMetadata",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments
      WHERE provider_payment_id = $1
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
        payment_currency AS "paymentCurrency",
        crypto_currency AS "cryptoCurrency",
        network,
        crypto_amount AS "cryptoAmount",
        fiat_amount AS "fiatAmount",
        transaction_hash AS "transactionHash",
        payment_address AS "paymentAddress",
        confirmation_count AS "confirmationCount",
        expiration,
        provider_metadata AS "providerMetadata",
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
      metadata,
      paymentCurrency,
      cryptoCurrency,
      network,
      cryptoAmount,
      fiatAmount,
      transactionHash,
      paymentAddress,
      confirmationCount,
      expiration,
      providerMetadata,
      checkoutUrl,
      relatedInvestmentId
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
    if (paymentCurrency !== undefined) {
      updates.push(`payment_currency = $${idx++}`);
      values.push(paymentCurrency);
    }
    if (cryptoCurrency !== undefined) {
      updates.push(`crypto_currency = $${idx++}`);
      values.push(cryptoCurrency);
    }
    if (network !== undefined) {
      updates.push(`network = $${idx++}`);
      values.push(network);
    }
    if (cryptoAmount !== undefined) {
      updates.push(`crypto_amount = $${idx++}`);
      values.push(cryptoAmount);
    }
    if (fiatAmount !== undefined) {
      updates.push(`fiat_amount = $${idx++}`);
      values.push(fiatAmount);
    }
    if (transactionHash !== undefined) {
      updates.push(`transaction_hash = $${idx++}`);
      values.push(transactionHash);
    }
    if (paymentAddress !== undefined) {
      updates.push(`payment_address = $${idx++}`);
      values.push(paymentAddress);
    }
    if (confirmationCount !== undefined) {
      updates.push(`confirmation_count = $${idx++}`);
      values.push(confirmationCount);
    }
    if (expiration !== undefined) {
      updates.push(`expiration = $${idx++}`);
      values.push(expiration);
    }
    if (providerMetadata !== undefined) {
      updates.push(`provider_metadata = $${idx++}`);
      values.push(JSON.stringify(providerMetadata));
    }
    if (checkoutUrl !== undefined) {
      updates.push(`checkout_url = $${idx++}`);
      values.push(checkoutUrl);
    }
    if (relatedInvestmentId !== undefined) {
      updates.push(`related_investment_id = $${idx++}`);
      values.push(relatedInvestmentId);
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
        payment_currency AS "paymentCurrency",
        crypto_currency AS "cryptoCurrency",
        network,
        crypto_amount AS "cryptoAmount",
        fiat_amount AS "fiatAmount",
        transaction_hash AS "transactionHash",
        payment_address AS "paymentAddress",
        confirmation_count AS "confirmationCount",
        expiration,
        provider_metadata AS "providerMetadata",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Counts payments for a user
   */
  async countByUserId(userId, options = {}, client) {
    const db = client || getPool();
    const { status } = options;

    let query = `SELECT COUNT(*)::int AS count FROM payments WHERE user_id = $1`;
    const values = [userId];

    if (status) {
      query += ` AND status = $2`;
      values.push(status);
    }

    const result = await db.query(query, values);
    return result.rows[0]?.count || 0;
  },

  /**
   * Gets pending payment summary (count & total amount) for a user
   */
  async getPendingSummary(userId, client) {
    const db = client || getPool();
    const query = `
      SELECT 
        COUNT(*)::int AS "count",
        COALESCE(SUM(amount), 0) AS "totalAmount"
      FROM payments
      WHERE user_id = $1 AND status IN ('PENDING', 'PROCESSING', 'AWAITING_PAYMENT', 'CONFIRMING')
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0] || { count: 0, totalAmount: 0 };
  }
};

module.exports = paymentRepository;
