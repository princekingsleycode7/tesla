const { setupTestDb } = require('../helpers/testDb');
const investmentService = require('../../backend/src/services/investmentService');
const planRepository = require('../../backend/src/repositories/planRepository');
const investmentRepository = require('../../backend/src/repositories/investmentRepository');

describe('Investment Service Unit Tests', () => {
  let testContext;
  let pool;
  let userAId;
  let userBId;
  let activePlanId;
  let inactivePlanId;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    // Create User A
    const userARes = await pool.query(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('investor_a@tesla.com', 'hash_a', 'USER', 'ACTIVE')
      RETURNING id;
    `);
    userAId = userARes.rows[0].id;

    // Create User B
    const userBRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('investor_b@tesla.com', 'hash_b', 'USER', 'ACTIVE')
      RETURNING id;
    `);
    userBId = userBRes.rows[0].id;

    // Retrieve active seed plan
    const planRes = await pool.query(`
      SELECT id FROM investment_products WHERE slug = 'tsla-direct-allocation';
    `);
    activePlanId = planRes.rows[0].id;

    // Create inactive plan for testing
    const inactiveRes = await pool.query(`
      INSERT INTO investment_products (
        slug, name, ticker, category, unit_price, min_investment, max_investment, status
      ) VALUES (
        'tsla-closed-tranche', 'Closed Historic Tranche', 'TSLA-OLD', 'EQUITY_OFFERING', 150.0000, 1000.0000, 50000.0000, 'CLOSED'
      ) RETURNING id;
    `);
    inactivePlanId = inactiveRes.rows[0].id;
  });

  afterAll(async () => {
    if (testContext && testContext.cleanup) {
      await testContext.cleanup();
    }
  });

  test('Retrieves available active investment plans', async () => {
    const plans = await investmentService.getAvailablePlans({ status: 'ACTIVE' });
    expect(plans.length).toBeGreaterThanOrEqual(3);
    const names = plans.map(p => p.name);
    expect(names).toContain('Tesla Direct Share Offering Tranche');
  });

  test('Retrieves plan by slug or ID', async () => {
    const plan = await investmentService.getPlan('tsla-direct-allocation');
    expect(plan).toBeDefined();
    expect(plan.id).toBe(activePlanId);
    expect(Number(plan.unitPrice)).toBe(248.0000);
    expect(Number(plan.minInvestment)).toBe(1000.0000);
  });

  test('Throws 404 PLAN_NOT_FOUND when plan does not exist', async () => {
    await expect(investmentService.getPlan('non-existent-slug')).rejects.toMatchObject({
      code: 'PLAN_NOT_FOUND',
      statusCode: 404
    });
  });

  test('Successfully creates a valid investment and records ledger transaction', async () => {
    const result = await investmentService.createInvestment({
      userId: userAId,
      planId: activePlanId,
      amount: 4960.0000, // 20 units at $248
      idempotencyKey: 'idemp-test-001',
      paymentMethod: 'ACH_TRANSFER'
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.investment).toBeDefined();
    expect(result.investment.userId).toBe(userAId);
    expect(Number(result.investment.totalAmount)).toBe(4960.0000);
    expect(Number(result.investment.units)).toBe(20.000000);
    expect(result.investment.certificateId).toMatch(/^TSLA-CERT-/);
    expect(result.transaction).toBeDefined();
    expect(result.transaction.status).toBe('SETTLED');
    expect(Number(result.transaction.amount)).toBe(4960.0000);

    // Verify database record
    const dbInv = await investmentRepository.findById(result.investment.id);
    expect(dbInv).not.toBeNull();
    expect(dbInv.certificateId).toBe(result.investment.certificateId);
  });

  test('Returns existing investment when re-submitting with identical idempotency key', async () => {
    const result = await investmentService.createInvestment({
      userId: userAId,
      planId: activePlanId,
      amount: 4960.0000,
      idempotencyKey: 'idemp-test-001'
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.investment.idempotencyKey).toBe('idemp-test-001');
  });

  test('Rejects investment amount below required plan minimum', async () => {
    // Min is $1,000 for TSLA Direct Allocation
    await expect(investmentService.createInvestment({
      userId: userAId,
      planId: activePlanId,
      amount: 500.0000
    })).rejects.toMatchObject({
      code: 'AMOUNT_BELOW_MINIMUM',
      statusCode: 400
    });
  });

  test('Rejects investment amount above allowed plan maximum', async () => {
    // Max is $5,000,000
    await expect(investmentService.createInvestment({
      userId: userAId,
      planId: activePlanId,
      amount: 6000000.0000
    })).rejects.toMatchObject({
      code: 'AMOUNT_EXCEEDS_MAXIMUM',
      statusCode: 400
    });
  });

  test('Rejects investment creation on inactive or closed plans', async () => {
    await expect(investmentService.createInvestment({
      userId: userAId,
      planId: inactivePlanId,
      amount: 2000.0000
    })).rejects.toMatchObject({
      code: 'PLAN_INACTIVE',
      statusCode: 400
    });
  });

  test('Enforces strict authorization: User B cannot access User A investment', async () => {
    // 1. User A creates investment
    const created = await investmentService.createInvestment({
      userId: userAId,
      planId: 'tsla-megapack-yield-note',
      amount: 5000.0000
    });

    const investmentId = created.investment.id;

    // 2. User A can view their own investment
    const fetchedByA = await investmentService.getUserInvestmentById(userAId, investmentId);
    expect(fetchedByA.id).toBe(investmentId);

    // 3. User B attempting to view User A investment must be rejected with 403 FORBIDDEN
    await expect(investmentService.getUserInvestmentById(userBId, investmentId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403
    });
  });

  test('Atomically rolls back transaction on error without corrupting total raised or creating orphaned ledger rows', async () => {
    const planBefore = await planRepository.findById(activePlanId);
    const initialTotalRaised = Number(planBefore.totalRaised);

    // Mock an error inside calculation or repository to force rollback
    const origCreate = investmentRepository.create;
    jest.spyOn(investmentRepository, 'create').mockImplementationOnce(async () => {
      throw new Error('Simulated database write failure');
    });

    await expect(investmentService.createInvestment({
      userId: userAId,
      planId: activePlanId,
      amount: 10000.0000,
      idempotencyKey: 'rollback-test-key'
    })).rejects.toThrow('Simulated database write failure');

    // Total raised must NOT have incremented
    const planAfter = await planRepository.findById(activePlanId);
    expect(Number(planAfter.totalRaised)).toBe(initialTotalRaised);

    // No orphaned investment record with rollback key
    const invCheck = await investmentRepository.findByIdempotencyKey('rollback-test-key');
    expect(invCheck).toBeNull();
  });
});
