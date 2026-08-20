const request = require('supertest');
const app = require('../../backend/src/app');
const { setupTestDb } = require('../helpers/testDb');
const TeslaPayProvider = require('../../backend/src/services/payments/TeslaPayProvider');

describe('Payment System API Integration Tests', () => {
  let testContext;
  let pool;
  let userAToken;
  let userBToken;
  let userAId;
  let userBId;
  let activePlan;
  let teslaProvider;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;
    teslaProvider = new TeslaPayProvider();

    // Register User A
    const regResA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'payer_alpha@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Alpha',
        lastName: 'Payer'
      });
    userAToken = regResA.body.data.token;
    userAId = regResA.body.data.user.id;

    // Register User B
    const regResB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'payer_beta@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Beta',
        lastName: 'Payer'
      });
    userBToken = regResB.body.data.token;
    userBId = regResB.body.data.user.id;

    // Get Active Investment Plan
    const plansRes = await request(app).get('/api/v1/plans');
    activePlan = plansRes.body.data.plans[0];
  });

  afterAll(async () => {
    if (testContext && testContext.cleanup) {
      await testContext.cleanup();
    }
  });

  describe('POST /api/v1/payments/initialize', () => {
    test('Rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initialize')
        .send({ amount: 5000 });
      expect(res.status).toBe(401);
    });

    test('Rejects invalid or non-positive amount with 400', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ amount: -500 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_AMOUNT');
    });

    test('Successfully initializes payment order', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          amount: 5000,
          planId: activePlan.id,
          provider: 'TESLA_PAY',
          paymentMethod: 'DIRECT_ALLOCATION'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment).toBeDefined();
      expect(Number(res.body.data.payment.amount)).toBe(5000);
      expect(res.body.data.payment.status).toBe('PENDING');
      expect(res.body.data.payment.provider).toBe('TESLA_PAY');
      expect(res.body.data.payment.checkoutUrl).toBeDefined();
    });

    test('Supports idempotency key replaying without duplicate records', async () => {
      const idempotencyKey = 'idemp_key_test_1001';
      const firstRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          amount: 10000,
          planId: activePlan.id,
          idempotencyKey
        });

      expect(firstRes.status).toBe(201);
      const paymentId = firstRes.body.data.payment.id;

      const secondRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          amount: 10000,
          planId: activePlan.id,
          idempotencyKey
        });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.isIdempotentReplay).toBe(true);
      expect(secondRes.body.data.payment.id).toBe(paymentId);
    });
  });

  describe('POST /api/v1/payments/webhook (Signature & Security Validation)', () => {
    test('Rejects webhook with missing signature header with 400', async () => {
      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .send({ event_type: 'payment.settled' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    test('Rejects webhook with invalid/tampered signature header with 400', async () => {
      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', 'invalid_signature_hash_12345')
        .send({ event_type: 'payment.settled' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    test('Rejects webhook referencing a nonexistent transaction/payment with 404', async () => {
      const fakePaymentId = '00000000-0000-0000-0000-000000000000';
      const payload = {
        event_id: 'evt_nonexistent_101',
        event_type: 'payment.settled',
        data: {
          payment_id: fakePaymentId,
          amount: 5000,
          currency: 'USD'
        }
      };

      const signed = teslaProvider.generateSignedWebhook(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });

    test('Rejects webhook with currency mismatch with 400', async () => {
      // Initialize a payment
      const initRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ amount: 5000, currency: 'USD' });

      const payment = initRes.body.data.payment;

      const payload = {
        event_id: 'evt_currency_mismatch_1',
        event_type: 'payment.settled',
        data: {
          payment_id: payment.id,
          amount: 5000,
          currency: 'EUR' // Mismatch!
        }
      };

      const signed = teslaProvider.generateSignedWebhook(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CURRENCY_MISMATCH');
    });

    test('Rejects webhook with amount mismatch with 400', async () => {
      const initRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ amount: 5000 });

      const payment = initRes.body.data.payment;

      const payload = {
        event_id: 'evt_amount_mismatch_1',
        event_type: 'payment.settled',
        data: {
          payment_id: payment.id,
          amount: 9999, // Mismatch! Expected 5000
          currency: 'USD'
        }
      };

      const signed = teslaProvider.generateSignedWebhook(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AMOUNT_MISMATCH');
    });
  });

  describe('Successful Payment Lifecycle & Idempotency', () => {
    let paymentId;

    beforeEach(async () => {
      const initRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          amount: 5000,
          planId: activePlan.id,
          provider: 'TESLA_PAY'
        });
      paymentId = initRes.body.data.payment.id;
    });

    test('Processes successful payment webhook, updates status to SUCCESS and issues investment', async () => {
      const eventId = `evt_success_${Date.now()}`;
      const payload = {
        event_id: eventId,
        event_type: 'payment.settled',
        data: {
          payment_id: paymentId,
          amount: 5000,
          currency: 'USD'
        }
      };

      const signed = teslaProvider.generateSignedWebhook(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.status).toBe('SUCCESS');

      // Verify payment details endpoint
      const getRes = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.payment.status).toBe('SUCCESS');
      expect(getRes.body.data.payment.relatedInvestmentId).toBeDefined();

      // Verify investment was created for User A
      const invRes = await request(app)
        .get('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(invRes.body.data.investments.length).toBeGreaterThan(0);
    });

    test('Duplicate and replayed webhook events do not duplicate financial effects', async () => {
      const eventId = `evt_duplicate_${Date.now()}`;
      const payload = {
        event_id: eventId,
        event_type: 'payment.settled',
        data: {
          payment_id: paymentId,
          amount: 5000,
          currency: 'USD'
        }
      };

      const signed = teslaProvider.generateSignedWebhook(payload);

      // First call
      const firstRes = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(firstRes.status).toBe(200);

      // Fetch user investment count
      const invRes1 = await request(app)
        .get('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`);
      const initialCount = invRes1.body.data.investments.length;

      // Replayed second call
      const secondRes = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.duplicate).toBe(true);

      // Verify no duplicate investment record was created
      const invRes2 = await request(app)
        .get('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(invRes2.body.data.investments.length).toBe(initialCount);
    });

    test('Already-completed transaction gracefully handles subsequent webhooks', async () => {
      const event1 = {
        event_id: `evt_settle_1_${Date.now()}`,
        event_type: 'payment.settled',
        data: { payment_id: paymentId, amount: 5000, currency: 'USD' }
      };
      const signed1 = teslaProvider.generateSignedWebhook(event1);

      await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed1.signature)
        .send(event1);

      // Send another SUCCESS webhook with a different event ID
      const event2 = {
        event_id: `evt_settle_2_${Date.now()}`,
        event_type: 'payment.settled',
        data: { payment_id: paymentId, amount: 5000, currency: 'USD' }
      };
      const signed2 = teslaProvider.generateSignedWebhook(event2);

      const res2 = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed2.signature)
        .send(event2);

      expect(res2.status).toBe(200);
      expect(res2.body.data.duplicate).toBe(true);
    });
  });

  describe('Failed and Cancelled Payment Handling', () => {
    test('Processes failed payment webhook', async () => {
      const initRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ amount: 5000 });
      const paymentId = initRes.body.data.payment.id;

      const payload = {
        event_id: `evt_fail_${Date.now()}`,
        event_type: 'payment.failed',
        data: { payment_id: paymentId, amount: 5000, currency: 'USD' }
      };
      const signed = teslaProvider.generateSignedWebhook(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.payment.status).toBe('FAILED');
    });

    test('Processes cancelled payment webhook', async () => {
      const initRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ amount: 5000 });
      const paymentId = initRes.body.data.payment.id;

      const payload = {
        event_id: `evt_cancel_${Date.now()}`,
        event_type: 'payment.cancelled',
        data: { payment_id: paymentId, amount: 5000, currency: 'USD' }
      };
      const signed = teslaProvider.generateSignedWebhook(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook/TESLA_PAY')
        .set('x-tesla-signature', signed.signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.payment.status).toBe('CANCELLED');
    });
  });

  describe('Authorization & Access Controls', () => {
    let userAPaymentId;

    beforeAll(async () => {
      const initRes = await request(app)
        .post('/api/v1/payments/initialize')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ amount: 2500 });
      userAPaymentId = initRes.body.data.payment.id;
    });

    test('Prevents User B from viewing User A payment details with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/${userAPaymentId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('User A can view their own payment history', async () => {
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.payments)).toBe(true);
      expect(res.body.data.payments.length).toBeGreaterThan(0);
    });
  });
});
