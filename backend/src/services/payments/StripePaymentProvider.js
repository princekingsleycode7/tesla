const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');

/**
 * Stripe Payment Provider implementation adhering to PaymentProvider contract.
 * Uses standard HMAC-SHA256 signature verification and normalizes Stripe webhook events.
 */
class StripePaymentProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.STRIPE_SECRET_KEY || 'sk_test_simulated_key';
    this.webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_tesla_2026';
    this.providerName = 'STRIPE';
  }

  getProviderName() {
    return this.providerName;
  }

  /**
   * Initializes a payment checkout session with Stripe
   */
  async createPayment(params) {
    const {
      paymentId,
      amount,
      currency = 'USD',
      description = 'Tesla Direct Asset Allocation',
      metadata = {},
      returnUrl = 'https://tesla.com/portal',
      cancelUrl = 'https://tesla.com/portal'
    } = params;

    const providerSessionId = `cs_test_${crypto.randomBytes(16).toString('hex')}`;
    const providerPaymentId = `pi_test_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = `${providerPaymentId}_secret_${crypto.randomBytes(12).toString('hex')}`;

    // Construct simulated Stripe Checkout URL
    const checkoutUrl = `https://checkout.stripe.com/c/pay/${providerSessionId}#client_secret=${clientSecret}`;

    return {
      providerPaymentId,
      providerSessionId,
      checkoutUrl,
      clientSecret,
      status: 'PENDING',
      metadata: {
        ...metadata,
        paymentId,
        provider: this.providerName
      }
    };
  }

  /**
   * Verifies standard Stripe signature header (t=timestamp,v1=signature)
   */
  verifyWebhookSignature(rawBody, signature, headers = {}) {
    if (!signature || typeof signature !== 'string') {
      return false;
    }

    try {
      const parts = signature.split(',').reduce((acc, part) => {
        const [k, v] = part.split('=');
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      }, {});

      const timestamp = parts.t;
      const signatureHash = parts.v1;

      if (!timestamp || !signatureHash) {
        // Fallback: If single raw hex signature is passed directly in header
        if (/^[a-f0-9]{64}$/i.test(signature)) {
          const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
          const computed = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(bodyStr)
            .digest('hex');
          return crypto.timingSafeEqual(Buffer.from(signatureHash || signature), Buffer.from(computed));
        }
        return false;
      }

      const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
      const signedPayload = `${timestamp}.${bodyStr}`;

      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(signedPayload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'hex');
      const actualBuf = Buffer.from(signatureHash, 'hex');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err) {
      return false;
    }
  }

  /**
   * Parses and normalizes Stripe event format
   */
  parseWebhookEvent(rawBody, headers = {}, parsedBody = {}) {
    let event = parsedBody;
    if (Buffer.isBuffer(rawBody) || typeof rawBody === 'string') {
      try {
        event = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
      } catch (e) {
        // fallback to parsedBody
      }
    }

    const eventId = event.id || `evt_${crypto.randomBytes(12).toString('hex')}`;
    const eventType = event.type || 'payment_intent.succeeded';
    const dataObject = event.data?.object || event;

    const providerPaymentId = dataObject.payment_intent || dataObject.id || dataObject.provider_payment_id || '';
    const rawAmount = dataObject.amount_received !== undefined ? dataObject.amount_received : (dataObject.amount || 0);
    // Stripe amounts are in smallest currency unit (cents)
    const amount = Number(dataObject.amount_major !== undefined ? dataObject.amount_major : (rawAmount > 1000 && !dataObject.is_major_unit ? (rawAmount / 100) : rawAmount));
    const currency = (dataObject.currency || 'USD').toUpperCase();
    const metadata = dataObject.metadata || {};
    const paymentId = metadata.paymentId || metadata.payment_id || dataObject.client_reference_id;

    let status = 'PENDING';
    if (eventType === 'checkout.session.completed' || eventType === 'payment_intent.succeeded' || eventType === 'charge.succeeded') {
      status = 'SUCCESS';
    } else if (eventType === 'payment_intent.payment_failed' || eventType === 'charge.failed') {
      status = 'FAILED';
    } else if (eventType === 'checkout.session.expired' || eventType === 'payment_intent.canceled') {
      status = 'CANCELLED';
    } else if (eventType === 'charge.refunded') {
      status = 'REFUNDED';
    } else if (eventType === 'payment_intent.processing') {
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
   * Mock or live fetch status
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
   * Refund handling
   */
  async refundPayment(providerPaymentId, amount, reason = 'requested_by_customer') {
    const refundId = `re_test_${crypto.randomBytes(16).toString('hex')}`;
    return {
      refundId,
      status: 'REFUNDED',
      amount,
      currency: 'USD'
    };
  }
}

module.exports = StripePaymentProvider;
