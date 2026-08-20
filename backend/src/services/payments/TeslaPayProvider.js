const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');

/**
 * Tesla Direct Asset & Capital Payment Provider
 * Institutional direct allocation clearing provider implementing HMAC-SHA256 signature verification.
 */
class TeslaPayProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.providerName = 'TESLA_PAY';
    this.webhookSecret = options.webhookSecret || process.env.TESLA_PAY_WEBHOOK_SECRET || 'teslapay_whsec_secret_2026_institutional';
  }

  getProviderName() {
    return this.providerName;
  }

  /**
   * Initializes a direct institutional payment order
   */
  async createPayment(params) {
    const {
      paymentId,
      amount,
      currency = 'USD',
      description = 'Tesla Direct Capital Allocation',
      metadata = {},
      returnUrl = 'https://tesla.com/portal',
      cancelUrl = 'https://tesla.com/portal'
    } = params;

    const providerPaymentId = `tp_pay_${crypto.randomBytes(16).toString('hex')}`;
    const providerSessionId = `tp_sess_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = `tp_sec_${crypto.randomBytes(24).toString('hex')}`;

    const checkoutUrl = `https://pay.tesla.com/checkout/${providerSessionId}?payment_id=${paymentId}`;

    return {
      providerPaymentId,
      providerSessionId,
      checkoutUrl,
      clientSecret,
      status: 'PENDING',
      metadata: {
        ...metadata,
        paymentId,
        provider: this.providerName,
        returnUrl,
        cancelUrl
      }
    };
  }

  /**
   * Verifies standard HMAC-SHA256 signature header (x-tesla-signature or x-signature)
   */
  verifyWebhookSignature(rawBody, signature, headers = {}) {
    if (!signature || typeof signature !== 'string') {
      return false;
    }

    try {
      const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(bodyStr)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature);
      const actualBuf = Buffer.from(signature.trim());

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err) {
      return false;
    }
  }

  /**
   * Generates a signed webhook payload helper for testing or dispatching
   */
  generateSignedWebhook(payload) {
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(bodyStr)
      .digest('hex');
    return {
      payload: bodyStr,
      signature,
      headers: {
        'x-tesla-signature': signature,
        'content-type': 'application/json'
      }
    };
  }

  /**
   * Parses and normalizes TeslaPay webhook events
   */
  parseWebhookEvent(rawBody, headers = {}, parsedBody = {}) {
    let event = parsedBody;
    if (Buffer.isBuffer(rawBody) || typeof rawBody === 'string') {
      try {
        event = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
      } catch (e) {
        // fallback
      }
    }

    const eventId = event.event_id || event.id || `tp_evt_${crypto.randomBytes(12).toString('hex')}`;
    const eventType = event.event_type || event.type || 'payment.settled';
    const data = event.data || event;

    const providerPaymentId = data.provider_payment_id || data.payment_intent_id || data.id || '';
    const amount = Number(data.amount || 0);
    const currency = (data.currency || 'USD').toUpperCase();
    const paymentId = data.payment_id || data.paymentId || data.metadata?.paymentId || data.metadata?.payment_id;
    const metadata = data.metadata || {};

    let status = 'PENDING';
    if (eventType === 'payment.settled' || eventType === 'payment.succeeded' || eventType === 'payment.success') {
      status = 'SUCCESS';
    } else if (eventType === 'payment.failed' || eventType === 'payment.declined') {
      status = 'FAILED';
    } else if (eventType === 'payment.cancelled' || eventType === 'payment.expired') {
      status = 'CANCELLED';
    } else if (eventType === 'payment.refunded') {
      status = 'REFUNDED';
    } else if (eventType === 'payment.processing') {
      status = 'PROCESSING';
    }

    return {
      eventId,
      eventType,
      providerPaymentId,
      status,
      amount,
      currency,
      paymentId,
      metadata,
      raw: event
    };
  }

  /**
   * Retrieves status
   */
  async getPaymentStatus(providerPaymentId) {
    return {
      providerPaymentId,
      status: 'SUCCESS',
      amount: 5000.00,
      currency: 'USD',
      metadata: {}
    };
  }

  /**
   * Refunds payment
   */
  async refundPayment(providerPaymentId, amount, reason = 'customer_request') {
    const refundId = `tp_ref_${crypto.randomBytes(16).toString('hex')}`;
    return {
      refundId,
      status: 'REFUNDED',
      amount,
      currency: 'USD'
    };
  }
}

module.exports = TeslaPayProvider;
