const request = require('supertest');
const app = require('../../backend/src/app');
const { setupTestDb } = require('../helpers/testDb');
const authService = require('../../backend/src/services/authService');
const paymentProviderFactory = require('../../backend/src/services/payments/paymentProviderFactory');

describe('NOWPayments & Payment Provider Expansion Integration Tests', () => {
  let dbCleanup;
  let authToken;
  let testUser;

  beforeAll(async () => {
    const { cleanup } = await setupTestDb();
    dbCleanup = cleanup;

    // Register test user
    const regResult = await authService.register({
      email: 'crypto.investor@tesla.com',
      password: 'CryptoPassword123!',
      firstName: 'Crypto',
      lastName: 'Investor'
    });
    testUser = regResult.user;
    authToken = regResult.token;
  });

  afterAll(async () => {
    if (dbCleanup) await dbCleanup();
  });

  describe('GET /api/v1/payments/methods', () => {
    test('Returns active payment options and supported crypto currencies', async () => {
      const response = await request(app)
        .get('/api/v1/payments/methods');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.traditional).toBeDefined();
      expect(response.body.data.crypto).toBeDefined();
      expect(response.body.data.crypto.provider).toBe('NOWPAYMENTS');
      expect(Array.isArray(response.body.data.crypto.currencies)).toBe(true);
      expect(response.body.data.crypto.currencies.some(c => c.code === 'BTC')).toBe(true);
    });
  });

  describe('Cryptocurrency Payment Initialization Flow', () => {
    test('Successfully initializes a BTC crypto payment order', async () => {
      const response = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 10000,
          currency: 'USD',
          paymentMethodType: 'CRYPTO',
          cryptoCurrency: 'BTC'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      const paymentData = response.body.data.payment;
      expect(paymentData.provider).toBe('NOWPAYMENTS');
      expect(paymentData.status).toBe('AWAITING_PAYMENT');
      expect(paymentData.cryptoCurrency).toBe('BTC');
      expect(paymentData.cryptoDetails).toBeDefined();
      expect(paymentData.cryptoDetails.paymentAddress).toBeDefined();
      expect(paymentData.cryptoDetails.cryptoAmount).toBeGreaterThan(0);
    });

    test('Successfully initializes an ETH crypto payment order', async () => {
      const response = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 25000,
          currency: 'USD',
          paymentMethodType: 'CRYPTO',
          cryptoCurrency: 'ETH'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      const paymentData = response.body.data.payment;
      expect(paymentData.provider).toBe('NOWPAYMENTS');
      expect(paymentData.cryptoCurrency).toBe('ETH');
      expect(paymentData.network).toContain('Ethereum');
    });

    test('Rejects payment initialization when crypto is disabled server-side', async () => {
      process.env.ENABLE_NOWPAYMENTS = 'false';
      process.env.ENABLE_CRYPTO_PAYMENTS = 'false';

      const response = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 5000,
          paymentMethodType: 'CRYPTO',
          cryptoCurrency: 'BTC'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CRYPTO_PAYMENTS_DISABLED');

      // Reset env
      delete process.env.ENABLE_NOWPAYMENTS;
      delete process.env.ENABLE_CRYPTO_PAYMENTS;
    });
  });

  describe('NOWPayments IPN Webhook Processing', () => {
    let paymentId;
    let providerPaymentId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 15000,
          currency: 'USD',
          paymentMethodType: 'CRYPTO',
          cryptoCurrency: 'BTC'
        });
      paymentId = res.body.data.payment.id;
      providerPaymentId = res.body.data.payment.providerPaymentId;
    });

    test('Rejects NOWPayments webhook with invalid signature', async () => {
      const response = await request(app)
        .post('/api/v1/payments/webhook/NOWPAYMENTS')
        .set('x-nowpayments-sig', 'invalid_signature_hash')
        .send({
          payment_id: providerPaymentId,
          order_id: paymentId,
          payment_status: 'finished',
          price_amount: 15000,
          price_currency: 'usd'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    test('Processes successful NOWPayments finished IPN webhook and settles payment', async () => {
      const response = await request(app)
        .post('/api/v1/payments/webhook/NOWPAYMENTS')
        .set('x-nowpayments-sig', 'test_valid_signature')
        .send({
          payment_id: providerPaymentId,
          order_id: paymentId,
          payment_status: 'finished',
          price_amount: 15000,
          price_currency: 'usd',
          pay_amount: 0.23076923,
          pay_currency: 'btc',
          actually_paid: 0.23076923,
          outcome_amount: 15000,
          outcome_currency: 'usd',
          txid: 'btc_tx_hash_987654321'
        });

      if (response.status !== 200) {
        console.error('WEBHOOK TEST 144 FAILED WITH:', response.status, response.body);
      }
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify payment updated status
      const getRes = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.payment.status).toBe('SUCCESS');
      expect(getRes.body.data.payment.transactionHash).toBe('btc_tx_hash_987654321');
    });

    test('Handles duplicate IPN webhooks idempotently', async () => {
      // First webhook
      await request(app)
        .post('/api/v1/payments/webhook/NOWPAYMENTS')
        .set('x-nowpayments-sig', 'test_valid_signature')
        .send({
          payment_id: providerPaymentId,
          order_id: paymentId,
          payment_status: 'finished',
          price_amount: 15000,
          price_currency: 'usd'
        });

      // Duplicate webhook
      const duplicateRes = await request(app)
        .post('/api/v1/payments/webhook/NOWPAYMENTS')
        .set('x-nowpayments-sig', 'test_valid_signature')
        .send({
          payment_id: providerPaymentId,
          order_id: paymentId,
          payment_status: 'finished',
          price_amount: 15000,
          price_currency: 'usd'
        });

      expect(duplicateRes.status).toBe(200);
      expect(duplicateRes.body.data.duplicate).toBe(true);
    });
  });

  describe('Kora Traditional Payment Gateway Integration', () => {
    test('Successfully initializes a payment with KORA provider', async () => {
      const response = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 5000,
          currency: 'USD',
          provider: 'KORA',
          paymentMethod: 'CARD'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payment.provider).toBe('KORA');
      expect(response.body.data.payment.checkoutUrl).toBeDefined();
    });

    test('Processes successful Kora charge.success webhook', async () => {
      const initRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 12000,
          currency: 'USD',
          provider: 'KORA'
        });

      const paymentId = initRes.body.data.payment.id;
      const ref = initRes.body.data.payment.providerPaymentId;

      const webhookRes = await request(app)
        .post('/api/v1/payments/webhook/KORA')
        .set('x-korapay-signature', 'test_valid_signature')
        .send({
          event: 'charge.success',
          data: {
            reference: ref,
            status: 'success',
            amount: 12000,
            currency: 'USD',
            metadata: { paymentId }
          }
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.success).toBe(true);

      const checkRes = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(checkRes.body.data.payment.status).toBe('SUCCESS');
    });
  });
});
