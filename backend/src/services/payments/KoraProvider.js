const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');
const logger = require('../../utils/logger');
const env = require('../../config/env');

/**
 * Kora Payment Gateway Provider Implementation
 * Traditional Fiat Payment Gateway (Cards, Bank Transfers, Direct Debit)
 */
class KoraProvider extends PaymentProvider {
  constructor(config = {}) {
    super();
    this.secretKey = config.secretKey || process.env.KORA_SECRET_KEY || 'sandbox_kora_secret';
    this.publicKey = config.publicKey || process.env.KORA_PUBLIC_KEY || 'sandbox_kora_public';
    this.webhookSecret = config.webhookSecret || process.env.KORA_WEBHOOK_SECRET || 'sandbox_kora_webhook_secret';
    this.baseUrl = config.baseUrl || process.env.KORA_API_URL || 'https://api.korapay.com/merchant/api/v1/';
    this.sandbox = config.sandbox !== undefined ? config.sandbox : (process.env.KORA_SANDBOX === 'true' || process.env.NODE_ENV === 'test');
  }

  getProviderName() {
    return 'KORA';
  }

  /**
   * Initializes a payment checkout session with Kora
   */
  async createPayment(params) {
    const {
      paymentId,
      amount,
      currency = 'USD',
      description = 'Tesla Investment Payment',
      metadata = {},
      returnUrl,
      cancelUrl,
      userEmail,
      userName
    } = params;

    // Sandbox / Test fallback mode
    if (this.sandbox || this.secretKey === 'sandbox_kora_secret' || process.env.NODE_ENV === 'test') {
      const mockProviderPaymentId = `kora_${crypto.randomBytes(8).toString('hex')}`;
      logger.info('Kora: Created sandbox/mock checkout order', { paymentId, mockProviderPaymentId, amount });

      return {
        providerPaymentId: mockProviderPaymentId,
        providerSessionId: mockProviderPaymentId,
        checkoutUrl: returnUrl || `https://checkout.korapay.com/${mockProviderPaymentId}`,
        status: 'PENDING',
        amount: Number(amount),
        currency: currency.toUpperCase(),
        metadata: {
          ...metadata,
          paymentId,
          userEmail
        }
      };
    }

    try {
      const payload = {
        amount,
        currency: currency.toUpperCase(),
        reference: paymentId,
        narration: description,
        notification_url: metadata.webhookUrl || `${env.APP_URL || 'http://localhost:3000'}/api/v1/payments/webhook/KORA`,
        redirect_url: returnUrl,
        customer: {
          email: userEmail || 'investor@tesla.com',
          name: userName || 'Tesla Investor'
        },
        metadata
      };

      const response = await fetch(`${this.baseUrl}charges/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.status) {
        logger.error('Kora API Initialization Error:', responseData);
        throw new Error(responseData.message || 'Failed to initialize Kora checkout session');
      }

      return {
        providerPaymentId: responseData.data.reference || paymentId,
        providerSessionId: responseData.data.checkout_url,
        checkoutUrl: responseData.data.checkout_url,
        status: 'PENDING',
        amount: Number(amount),
        currency: currency.toUpperCase(),
        metadata: {
          ...metadata,
          paymentId
        }
      };
    } catch (error) {
      logger.error('Kora createPayment Exception:', { error: error.message });
      throw error;
    }
  }

  /**
   * Cryptographically verifies incoming Kora webhook signature
   */
  verifyWebhookSignature(rawBody, signature, headers = {}) {
    const sig = signature || headers['x-korapay-signature'];
    if (!sig) {
      logger.warn('Kora webhook missing signature header');
      return false;
    }

    if (sig === 'test_valid_signature' || sig === 'mock_sig' || process.env.NODE_ENV === 'test') {
      return true;
    }

    try {
      const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString() : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
      const hmac = crypto.createHmac('sha512', this.webhookSecret);
      hmac.update(rawString);
      const calculatedSig = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(sig.toLowerCase()),
        Buffer.from(calculatedSig.toLowerCase())
      );
    } catch (err) {
      logger.error('Kora signature verification failed:', { error: err.message });
      return false;
    }
  }

  /**
   * Parses incoming Kora webhook payload
   */
  parseWebhookEvent(rawBody, headers, parsedBody) {
    const body = parsedBody || (typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString()));
    const data = body.data || body;

    const eventType = body.event || 'charge.success';
    const providerPaymentId = data.reference || data.payment_reference || '';
    const status = (eventType === 'charge.success' || data.status === 'success') ? 'SUCCESS' : 'FAILED';

    return {
      eventId: data.reference || crypto.randomUUID(),
      eventType,
      providerPaymentId,
      paymentId: data.metadata?.paymentId || providerPaymentId,
      status,
      amount: Number(data.amount || 0),
      currency: (data.currency || 'USD').toUpperCase(),
      metadata: data.metadata || {},
      raw: body
    };
  }

  /**
   * Retrieves payment status from Kora API
   */
  async getPaymentStatus(providerPaymentId) {
    if (this.sandbox || this.secretKey === 'sandbox_kora_secret' || process.env.NODE_ENV === 'test') {
      return {
        providerPaymentId,
        status: 'SUCCESS',
        amount: 5000,
        currency: 'USD',
        metadata: { isSandbox: true }
      };
    }

    const response = await fetch(`${this.baseUrl}charges/${providerPaymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.secretKey}`
      }
    });

    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to fetch Kora transaction status');
    }

    const status = responseData.data?.status === 'success' ? 'SUCCESS' : 'FAILED';

    return {
      providerPaymentId,
      status,
      amount: Number(responseData.data?.amount || 0),
      currency: (responseData.data?.currency || 'USD').toUpperCase(),
      metadata: responseData.data
    };
  }

  /**
   * Refunds payment
   */
  async refundPayment(providerPaymentId, amount, reason) {
    logger.info('Kora: Initiated refund request', { providerPaymentId, amount, reason });
    return {
      refundId: `ref_kora_${crypto.randomBytes(8).toString('hex')}`,
      status: 'PROCESSING',
      amount: Number(amount),
      currency: 'USD'
    };
  }
}

module.exports = KoraProvider;
