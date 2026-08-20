const request = require('supertest');
const app = require('../../backend/src/app');
const { setupTestDb } = require('../helpers/testDb');

describe('User Dashboard API Integration Tests', () => {
  let testContext;
  let pool;
  let userAToken;
  let userAId;
  let userBToken;
  let userBId;
  let emptyUserToken;
  let activePlan;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    // 1. Register User A (Will hold multiple investments and transactions)
    const regResA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'dash_alpha@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Alpha',
        lastName: 'DashboardUser'
      });
    userAToken = regResA.body.data.token;
    userAId = regResA.body.data.user.id;

    // 2. Register User B (For cross-user isolation testing)
    const regResB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'dash_beta@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Beta',
        lastName: 'DashboardUser'
      });
    userBToken = regResB.body.data.token;
    userBId = regResB.body.data.user.id;

    // 3. Register Empty User (New account with no transactions)
    const regResEmpty = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'dash_empty@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Empty',
        lastName: 'Account'
      });
    emptyUserToken = regResEmpty.body.data.token;

    // Get Active Investment Plan
    const plansRes = await request(app).get('/api/v1/plans');
    activePlan = plansRes.body.data.plans[0];
  });

  afterAll(async () => {
    if (testContext && testContext.cleanup) {
      await testContext.cleanup();
    }
  });

  describe('Unauthenticated Access Guards', () => {
    test('GET /api/v1/dashboard/overview returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/v1/dashboard/overview');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('GET /api/v1/dashboard/investments returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/v1/dashboard/investments');
      expect(res.status).toBe(401);
    });

    test('GET /api/v1/dashboard/transactions returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/v1/dashboard/transactions');
      expect(res.status).toBe(401);
    });

    test('GET /api/v1/dashboard/payments returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/v1/dashboard/payments');
      expect(res.status).toBe(401);
    });

    test('GET /api/v1/dashboard/activity returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/v1/dashboard/activity');
      expect(res.status).toBe(401);
    });
  });

  describe('Empty Account Dashboard Metrics', () => {
    test('GET /api/v1/dashboard/overview returns zeroed financial metrics for fresh account', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${emptyUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { summary, recentInvestments, recentTransactions, recentPayments, recentActivity } = res.body.data;
      expect(summary.totalInvested).toBe('0.00');
      expect(summary.activeInvestments).toBe(0);
      expect(summary.portfolioValue).toBe('0.00');
      expect(summary.returns).toBe('0.00');
      expect(summary.pendingTransactions).toBe(0);

      expect(recentInvestments).toEqual([]);
      expect(recentTransactions).toEqual([]);
      expect(recentPayments).toEqual([]);
      expect(Array.isArray(recentActivity)).toBe(true);
    });
  });

  describe('Multiple Investments & Real Data Aggregation', () => {
    test('Executes multiple investments for User A and verifies aggregated totals', async () => {
      // 1. Create first investment ($5,000)
      const inv1Res = await request(app)
        .post('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          planId: activePlan.id,
          amount: 5000,
          paymentMethod: 'TESLA_PAY',
          idempotencyKey: 'dash_test_key_1'
        });
      expect(inv1Res.status).toBe(201);

      // 2. Create second investment ($10,000)
      const inv2Res = await request(app)
        .post('/api/v1/investments')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          planId: activePlan.id,
          amount: 10000,
          paymentMethod: 'TESLA_PAY',
          idempotencyKey: 'dash_test_key_2'
        });
      expect(inv2Res.status).toBe(201);

      // 3. Fetch Dashboard Overview for User A
      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { summary, recentInvestments, recentTransactions } = res.body.data;

      // Total invested must equal 15000.00
      expect(summary.totalInvested).toBe('15000.00');
      expect(summary.activeInvestments).toBe(2);
      expect(parseFloat(summary.portfolioValue)).toBeGreaterThanOrEqual(15000);
      expect(parseFloat(summary.returns)).toBeGreaterThan(0);

      expect(recentInvestments.length).toBe(2);
      expect(recentTransactions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Cross-User Data Isolation & Security Authorization', () => {
    test('User B requesting dashboard receives only User B empty state and cannot see User A metrics', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { summary, recentInvestments } = res.body.data;

      // User B must not see User A's $15,000 investment
      expect(summary.totalInvested).toBe('0.00');
      expect(summary.activeInvestments).toBe(0);
      expect(recentInvestments).toEqual([]);
    });

    test('User B requesting /api/v1/dashboard/investments gets empty array', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/investments')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.investments).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });

  describe('Section Endpoint Pagination & Filtering', () => {
    test('GET /api/v1/dashboard/investments supports pagination parameters (page=1, limit=1)', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/investments?page=1&limit=1')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { investments, pagination } = res.body.data;
      expect(investments.length).toBe(1);
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(1);
      expect(pagination.total).toBe(2);
      expect(pagination.totalPages).toBe(2);
    });

    test('GET /api/v1/dashboard/transactions retrieves paginated financial transaction ledger', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/transactions?page=1&limit=10')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { transactions, pagination } = res.body.data;
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThanOrEqual(2);
      expect(pagination.total).toBeGreaterThanOrEqual(2);
    });

    test('GET /api/v1/dashboard/payments retrieves payment order history', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/payments')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.payments)).toBe(true);
    });

    test('GET /api/v1/dashboard/activity retrieves audit log event trail', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { activities, pagination } = res.body.data;
      expect(Array.isArray(activities)).toBe(true);
      expect(pagination.total).toBeGreaterThan(0);
    });
  });
});
