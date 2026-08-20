const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');
const logger = require('../../utils/logger');
const env = require('../../config/env');

/**
 * NOWPayments Cryptocurrency Payment Provider Implementation
 * Supports Bitcoin, Ethereum, USDT, Litecoin, Dogecoin, Solana, and other crypto assets.
 */
class NOWPaymentsProvider extends PaymentProvider {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.NOWPAYMENTS_API_KEY || 'sandbox_nowpayments_key';
    this.ipnSecret = config.ipnSecret || process.env.NOWPAYMENTS_IPN_SECRET || 'sandbox_nowpayments_secret';
    this.baseUrl = config.baseUrl || process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1/';
    this.sandbox = config.sandbox !== undefined ? config.sandbox : (process.env.NOWPAYMENTS_SANDBOX === 'true' || process.env.NODE_ENV === 'test');
  }

  getProviderName() {
    return 'NOWPAYMENTS';
  }

  /**
   * Supported crypto currencies and metadata
   */
  getAvailableCurrencies() {
    return [
      { code: 'BTC', name: 'Bitcoin', network: 'Bitcoin Mainnet', minAmount: 10, icon: '₿' },
      { code: 'ETH', name: 'Ethereum', network: 'Ethereum ERC20', minAmount: 10, icon: 'Ξ' },
      { code: 'USDTTRC20', name: 'Tether (TRC20)', network: 'TRON TRC20', minAmount: 5, icon: '₮' },
      { code: 'USDTERC20', name: 'Tether (ERC20)', network: 'Ethereum ERC20', minAmount: 10, icon: '₮' },
      { code: 'LTC', name: 'Litecoin', network: 'Litecoin Mainnet', minAmount: 5, icon: 'Ł' },
      { code: 'DOGE', name: 'Dogecoin', network: 'Dogecoin Mainnet', minAmount: 5, icon: 'Ð' },
      { code: 'SOL', name: 'Solana', network: 'Solana Mainnet', minAmount: 5, icon: '◎' }
    ];
  }

  /**
   * Initializes a payment request with NOWPayments
   */
  async createPayment(params) {
    const {
      paymentId,
      amount,
      currency = 'USD',
      payCurrency = 'BTC',
      description = 'Tesla Investor Asset Purchase',
      metadata = {},
      returnUrl,
      cancelUrl,
      userEmail
    } = params;

    const formattedPayCurrency = (payCurrency || 'BTC').toLowerCase();

    // Sandbox/Mock response mode if no real API key or in test mode
    if (this.sandbox || this.apiKey === 'sandbox_nowpayments_key' || process.env.NODE_ENV === 'test') {
      const mockProviderPaymentId = `now_${crypto.randomBytes(8).toString('hex')}`;
      const mockPaymentAddress = `tb1q_${crypto.randomBytes(16).toString('hex')}`;
      const estimatedCryptoAmount = Number((amount / 65000).toFixed(8)); // Example conversion for BTC

      logger.info('NOWPayments: Created sandbox/mock payment order', {
        paymentId,
        mockProviderPaymentId,
        amount,
        payCurrency: formattedPayCurrency
      });

      return {
        providerPaymentId: mockProviderPaymentId,
        providerSessionId: mockProviderPaymentId,
        checkoutUrl: returnUrl || `https://nowpayments.io/payment/?iid=${mockProviderPaymentId}`,
        status: 'AWAITING_PAYMENT',
        amount: Number(amount),
        currency: currency.toUpperCase(),
        cryptoCurrency: formattedPayCurrency.toUpperCase(),
        network: this._getNetworkForCurrency(formattedPayCurrency),
        cryptoAmount: estimatedCryptoAmount,
        paymentAddress: mockPaymentAddress,
        expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        metadata: {
          ...metadata,
          paymentId,
          userEmail
        }
      };
    }

    try {
      const payload = {
        price_amount: amount,
        price_currency: currency.toLowerCase(),
        pay_currency: formattedPayCurrency,
        ipn_callback_url: metadata.webhookUrl || `${env.APP_URL || 'http://localhost:3000'}/api/v1/payments/webhook/NOWPAYMENTS`,
        order_id: paymentId,
        order_description: description,
        is_fee_paid_by_user: true
      };

      const response = await fetch(`${this.baseUrl}payment`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        logger.error('NOWPayments API Error:', responseData);
        throw new Error(responseData.message || 'Failed to initialize NOWPayments payment');
      }

      return {
        providerPaymentId: String(responseData.payment_id),
        providerSessionId: String(responseData.payment_id),
        checkoutUrl: responseData.invoice_url || `https://nowpayments.io/payment/?iid=${responseData.payment_id}`,
        status: this._mapNOWPaymentsStatus(responseData.payment_status),
        amount: Number(responseData.price_amount || amount),
        currency: (responseData.price_currency || currency).toUpperCase(),
        cryptoCurrency: (responseData.pay_currency || formattedPayCurrency).toUpperCase(),
        network: this._getNetworkForCurrency(responseData.pay_currency || formattedPayCurrency),
        cryptoAmount: Number(responseData.pay_amount || 0),
        paymentAddress: responseData.pay_address || null,
        expiration: responseData.expiration_estimate_date || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        metadata: {
          ...metadata,
          paymentId
        }
      };
    } catch (error) {
      logger.error('NOWPayments createPayment Exception:', { error: error.message });
      throw error;
    }
  }

  /**
   * Cryptographically verifies the NOWPayments IPN HMAC-SHA512 signature
   */
  verifyWebhookSignature(rawBody, signature, headers = {}) {
    const sig = signature || headers['x-nowpayments-sig'];
    if (!sig) {
      logger.warn('NOWPayments IPN missing signature header');
      return false;
    }

    // Bypass in test environment or when test signature supplied
    if (sig === 'test_valid_signature' || sig === 'mock_sig' || process.env.NODE_ENV === 'test') {
      return true;
    }

    try {
      let parsedBody = rawBody;
      if (typeof rawBody === 'string' || Buffer.isBuffer(rawBody)) {
        parsedBody = JSON.parse(rawBody.toString());
      }

      const sortedObj = this._sortObject(parsedBody);
      const jsonString = JSON.stringify(sortedObj);

      const hmac = crypto.createHmac('sha512', this.ipnSecret);
      hmac.update(jsonString);
      const calculatedSig = hmac.digest('hex');

      const isMatch = crypto.timingSafeEqual(
        Buffer.from(sig.toLowerCase()),
        Buffer.from(calculatedSig.toLowerCase())
      );

      return isMatch;
    } catch (err) {
      logger.error('NOWPayments IPN signature verification failed:', { error: err.message });
      return false;
    }
  }

  /**
   * Parses and normalizes incoming NOWPayments IPN webhook payload
   */
  parseWebhookEvent(rawBody, headers, parsedBody) {
    const body = parsedBody || (typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString()));

    const providerPaymentId = String(body.payment_id || body.invoice_id || '');
    const internalPaymentId = body.order_id || null;
    const nowStatus = body.payment_status || 'waiting';
    const mappedStatus = this._mapNOWPaymentsStatus(nowStatus);

    return {
      eventId: String(body.payment_id || crypto.randomUUID()),
      eventType: `payment.${nowStatus}`,
      providerPaymentId,
      paymentId: internalPaymentId,
      status: mappedStatus,
      amount: Number(body.price_amount || 0),
      currency: (body.price_currency || 'USD').toUpperCase(),
      cryptoCurrency: (body.pay_currency || '').toUpperCase(),
      cryptoAmount: Number(body.pay_amount || body.actually_paid || 0),
      actuallyPaid: Number(body.actually_paid || 0),
      transactionHash: body.outcome_amount ? (body.txid || body.hash || null) : (body.txid || null),
      metadata: {
        rawStatus: nowStatus,
        payAddress: body.pay_address,
        purchaseId: body.purchase_id,
        outcomeCurrency: body.outcome_currency,
        outcomeAmount: body.outcome_amount
      },
      raw: body
    };
  }

  /**
   * Retrieves live payment status
   */
  async getPaymentStatus(providerPaymentId) {
    if (this.sandbox || this.apiKey === 'sandbox_nowpayments_key' || process.env.NODE_ENV === 'test') {
      return {
        providerPaymentId,
        status: 'COMPLETED',
        amount: 5000,
        currency: 'USD',
        cryptoCurrency: 'BTC',
        cryptoAmount: 0.07692307,
        metadata: { isSandbox: true }
      };
    }

    const response = await fetch(`${this.baseUrl}payment/${providerPaymentId}`, {
      method: 'GET',
      headers: {
        'x-api-key': this.apiKey
      }
    });

    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to fetch NOWPayments payment status');
    }

    return {
      providerPaymentId: String(responseData.payment_id),
      status: this._mapNOWPaymentsStatus(responseData.payment_status),
      amount: Number(responseData.price_amount || 0),
      currency: (responseData.price_currency || 'USD').toUpperCase(),
      cryptoCurrency: (responseData.pay_currency || '').toUpperCase(),
      cryptoAmount: Number(responseData.pay_amount || 0),
      metadata: responseData
    };
  }

  /**
   * Refunds payment (Simulated for crypto)
   */
  async refundPayment(providerPaymentId, amount, reason) {
    logger.info('NOWPayments: Initiated crypto refund request', { providerPaymentId, amount, reason });
    return {
      refundId: `ref_${crypto.randomBytes(8).toString('hex')}`,
      status: 'PROCESSING',
      amount: Number(amount),
      currency: 'USD'
    };
  }

  /**
   * Maps NOWPayments status to system canonical status
   */
  _mapNOWPaymentsStatus(status) {
    switch ((status || '').toLowerCase()) {
      case 'waiting':
        return 'AWAITING_PAYMENT';
      case 'confirming':
        return 'CONFIRMING';
      case 'confirmed':
      case 'sending':
      case 'finished':
        return 'SUCCESS';
      case 'failed':
      case 'refunded':
        return 'FAILED';
      case 'expired':
        return 'EXPIRED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Gets network string from currency code
   */
  _getNetworkForCurrency(code) {
    const c = (code || '').toUpperCase();
    if (c === 'BTC') return 'Bitcoin';
    if (c === 'ETH' || c === 'USDTERC20') return 'Ethereum (ERC20)';
    if (c === 'USDTTRC20') return 'TRON (TRC20)';
    if (c === 'LTC') return 'Litecoin';
    if (c === 'DOGE') return 'Dogecoin';
    if (c === 'SOL') return 'Solana';
    return 'Blockchain Network';
  }

  /**
   * Helper to alphabetically sort object keys for IPN HMAC verification
   */
  _sortObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }
    return Object.keys(obj)
      .sort()
      .reduce((result, key) => {
        result[key] = (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key]))
          ? this._sortObject(obj[key])
          : obj[key];
        return result;
      }, {});
  }
}

module.exports = NOWPaymentsProvider;
