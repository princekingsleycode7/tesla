const request = require('supertest');
const app = require('../../backend/src/app');
const { setupTestDb } = require('../helpers/testDb');

describe('Investment API Integration Tests', () => {
  let testContext;
  let pool;
  let userAToken;
  let userBToken;
  let userAId;
  let userBId;
  let activePlan;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    // Register User A
    const regResA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'investor_alpha@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Alpha',
        lastName: 'Investor'
      });
    userAToken = regResA.body.data.token;
    userAId = regResA.body.data.user.id;

    // Register User B
    const regResB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'investor_beta@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Beta',
        lastName: 'Investor'
      });
    userBToken = regResB.body.data.token;
    userBId = regResB.body.data.user.id;

    // Fetch active plan
    const plansRes = await request(app).get('/api/v1/plans');
    activePlan = plansRes.body.data.plans[0];
  });

  afterAll(async () => {
    if (testContext && testContext.cleanup) {
      await testContext.cleanup();
    }
  });

  describe('GET /api/v1/plans', () => {
    test('Publicly retrieves available investment offerings', async () => {
      const res = await request(app).get('/api/v1/plans');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.plans)).toBe(true);
      expect(res.body.data.plans.length).toBeGreaterThanOrEqual(3);

      const directOffering = res.body.data.plans.find(p => p.slug === 'tsla-direct-allocation');
      expect(directOffering).toBeDefined();
      expect(Number(directOffering.unitPrice)).toBe(248);
    });

    test('Retrieves single plan by slug or ID', async () => {
      const res = await request(app).get('/api/v1/plans/tsla-megapack-yield-note');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.plan.ticker).toBe('TSLA-ENRG');
      expect(res.body.data.plan.durationMonths).toBe(36);
    });

    test('Returns 404 when querying non-existent plan', async () => {
      const res = await request(app).get('/api/v1/plans/non-existent-plan');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PLAN_NOT_FOUND');
    });
  });

  describe('POST /api/v1/investments', () => {
    test('Rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/v1/investments')
        .send({
          planId: activePlan.id,
          amount: 2000
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Creates valid investment for authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          planId: 'tsla-megapack-yield-note',
          amount: 5000,
          paymentMethod: 'WIRE_TRANSFER'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.investment).toBeDefined();
      expect(res.body.data.investment.userId).toBe(userAId);
      expect(Number(res.body.data.investment.totalAmount)).toBe(5000);
      expect(res.body.data.investment.certificateId).toMatch(/^TSLA-ENRG-CERT-/);
      expect(res.body.data.transaction).toBeDefined();
      expect(res.body.data.transaction.status).toBe('SETTLED');
    });

    test('Enforces minimum investment amount check', async () => {
      const res = await request(app)
        .post('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          planId: 'tsla-megapack-yield-note',
          amount: 500 // Min is 2500
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AMOUNT_BELOW_MINIMUM');
    });

    test('Handles idempotency key gracefully on duplicate submissions', async () => {
      const idempotencyKey = 'api-idemp-test-999';

      // 1. Initial creation
      const res1 = await request(app)
        .post('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          planId: 'tsla-direct-allocation',
          amount: 2480
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.isDuplicate).toBe(false);
      const originalInvestmentId = res1.body.data.investment.id;

      // 2. Duplicate submission with same Idempotency-Key
      const res2 = await request(app)
        .post('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          planId: 'tsla-direct-allocation',
          amount: 2480
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.isDuplicate).toBe(true);
      expect(res2.body.data.investment.id).toBe(originalInvestmentId);
    });
  });

  describe('GET /api/v1/investments and /:id', () => {
    let userAInvestmentId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          planId: 'tsla-optimus-robotics-tranche',
          amount: 10000
        });
      userAInvestmentId = res.body.data.investment.id;
    });

    test('Lists authenticated user investments', async () => {
      const res = await request(app)
        .get('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.investments.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.investments.every(i => i.userId === userAId)).toBe(true);
    });

    test('Owner can retrieve single investment details', async () => {
      const res = await request(app)
        .get(`/api/v1/investments/${userAInvestmentId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.investment.id).toBe(userAInvestmentId);
      expect(res.body.data.investment.planName).toBe('Optimus Humanoid Robotics Strategic Tranche');
    });

    test('Forbidden 403 when User B attempts to access User A investment', async () => {
      const res = await request(app)
        .get(`/api/v1/investments/${userAInvestmentId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Retrieves user portfolio summary and ledger history', async () => {
      const summaryRes = await request(app)
        .get('/api/v1/investments/summary')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.summary.totalCount).toBeGreaterThanOrEqual(2);
      expect(Number(summaryRes.body.data.summary.totalInvestedAmount)).toBeGreaterThan(0);

      const historyRes = await request(app)
        .get('/api/v1/investments/history')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(historyRes.status).toBe(200);
      expect(Array.isArray(historyRes.body.data.history)).toBe(true);
      expect(historyRes.body.data.history.length).toBeGreaterThanOrEqual(2);
      expect(historyRes.body.data.history[0].type).toBe('INVESTMENT');
    });
  });
});
