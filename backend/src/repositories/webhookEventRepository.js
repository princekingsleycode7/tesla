const { getPool } = require('../config/database');

/**
 * Data Access Layer for Payment Webhook Audit & Idempotency Events
 */
const webhookEventRepository = {
  /**
   * Records a new webhook event
   */
  async recordEvent(eventData, client) {
    const db = client || getPool();
    const {
      eventId,
      provider,
      eventType,
      paymentId = null,
      status = 'PROCESSED',
      payload = {},
      signature = null,
      errorMessage = null
    } = eventData;

    const query = `
      INSERT INTO payment_webhook_events (
        event_id,
        provider,
        event_type,
        payment_id,
        status,
        payload,
        signature,
        error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      RETURNING 
        id,
        event_id AS "eventId",
        provider,
        event_type AS "eventType",
        payment_id AS "paymentId",
        status,
        payload,
        signature,
        error_message AS "errorMessage",
        created_at AS "createdAt";
    `;

    const values = [
      eventId,
      provider,
      eventType,
      paymentId,
      status,
      JSON.stringify(payload),
      signature,
      errorMessage
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  },

  /**
   * Finds an existing webhook event by provider and event ID
   */
  async findByProviderAndEventId(provider, eventId, client) {
    const db = client || getPool();
    const query = `
      SELECT 
        id,
        event_id AS "eventId",
        provider,
        event_type AS "eventType",
        payment_id AS "paymentId",
        status,
        payload,
        signature,
        error_message AS "errorMessage",
        created_at AS "createdAt"
      FROM payment_webhook_events
      WHERE provider = $1 AND event_id = $2;
    `;

    const result = await db.query(query, [provider, eventId]);
    return result.rows[0] || null;
  },

  /**
   * Updates status of a processed event
   */
  async updateStatus(id, status, errorMessage = null, client) {
    const db = client || getPool();
    const query = `
      UPDATE payment_webhook_events
      SET status = $2, error_message = $3
      WHERE id = $1
      RETURNING 
        id,
        event_id AS "eventId",
        provider,
        event_type AS "eventType",
        payment_id AS "paymentId",
        status,
        error_message AS "errorMessage",
        created_at AS "createdAt";
    `;

    const result = await db.query(query, [id, status, errorMessage]);
    return result.rows[0] || null;
  }
};

module.exports = webhookEventRepository;
