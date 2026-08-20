const planRepository = require('../repositories/planRepository');
const investmentRepository = require('../repositories/investmentRepository');
const transactionRepository = require('../repositories/transactionRepository');
const auditRepository = require('../repositories/auditRepository');
const investmentCalculationService = require('./investmentCalculationService');
const { withTransaction } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Core Investment Business Logic Service
 */
const investmentService = {
  /**
   * Retrieves all available investment plans
   * @param {Object} [filters]
   */
  async getAvailablePlans(filters = {}) {
    return planRepository.findAll(filters);
  },

  /**
   * Retrieves a single plan by ID or slug
   * @param {string} idOrSlug
   */
  async getPlan(idOrSlug) {
    const plan = await planRepository.findByIdOrSlug(idOrSlug);
    if (!plan) {
      const error = new Error(`Investment plan '${idOrSlug}' was not found`);
      error.code = 'PLAN_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }
    return plan;
  },

  /**
   * Executes a new investment creation within a database transaction
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.planId - Plan UUID or slug
   * @param {number|string} params.amount
   * @param {string} [params.idempotencyKey]
   * @param {string} [params.paymentMethod='INTERNAL_BALANCE']
   * @param {Object} [params.metadata={}]
   * @param {string} [params.ipAddress]
   * @param {string} [params.userAgent]
   */
  async createInvestment({
    userId,
    planId,
    amount,
    idempotencyKey = null,
    paymentMethod = 'DIRECT_ALLOCATION',
    metadata = {},
    ipAddress = null,
    userAgent = null
  }) {
    if (!userId) {
      const error = new Error('Authenticated user ID is required');
      error.code = 'UNAUTHORIZED';
      error.statusCode = 401;
      throw error;
    }

    if (!planId) {
      const error = new Error('Investment plan ID or slug is required');
      error.code = 'INVALID_PLAN';
      error.statusCode = 400;
      throw error;
    }

    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount) || numAmount <= 0) {
      const error = new Error('Investment amount must be a positive number');
      error.code = 'INVALID_AMOUNT';
      error.statusCode = 400;
      throw error;
    }

    // 1. Check idempotency if key is provided
    if (idempotencyKey) {
      const existing = await investmentRepository.findByIdempotencyKey(idempotencyKey, userId);
      if (existing) {
        logger.info('Returning existing investment for duplicate idempotency key', {
          userId,
          idempotencyKey,
          investmentId: existing.id
        });
        return {
          investment: existing,
          isDuplicate: true,
          message: 'Investment already processed'
        };
      }
    }

    // 2. Execute within strict DB transaction
    return await withTransaction(async (client) => {
      // Find plan inside transaction
      const plan = await planRepository.findByIdOrSlug(planId, client);
      if (!plan) {
        const error = new Error(`Investment plan '${planId}' does not exist`);
        error.code = 'PLAN_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      // Check plan status
      if (plan.status !== 'ACTIVE') {
        const error = new Error(`Investment plan '${plan.name}' is currently ${plan.status.toLowerCase()} and not accepting allocations`);
        error.code = 'PLAN_INACTIVE';
        error.statusCode = 400;
        throw error;
      }

      const minInvestment = parseFloat(plan.minInvestment);
      if (numAmount < minInvestment) {
        const error = new Error(`Investment amount ($${numAmount.toFixed(2)}) is below the required minimum of $${minInvestment.toFixed(2)}`);
        error.code = 'AMOUNT_BELOW_MINIMUM';
        error.statusCode = 400;
        throw error;
      }

      if (plan.maxInvestment) {
        const maxInvestment = parseFloat(plan.maxInvestment);
        if (numAmount > maxInvestment) {
          const error = new Error(`Investment amount ($${numAmount.toFixed(2)}) exceeds maximum allowed limit of $${maxInvestment.toFixed(2)}`);
          error.code = 'AMOUNT_EXCEEDS_MAXIMUM';
          error.statusCode = 400;
          throw error;
        }
      }

      // 3. Server-side authoritative financial calculations
      const metrics = investmentCalculationService.calculateInvestmentMetrics(plan, numAmount);
      const certificateId = investmentCalculationService.generateCertificateId(plan.ticker || 'TSLA');
      const transactionReference = investmentCalculationService.generateTransactionReference('INV');

      // 4. Create User Investment record
      const investment = await investmentRepository.create({
        userId,
        productId: plan.id,
        units: metrics.units,
        pricePerUnit: metrics.pricePerUnit,
        totalAmount: metrics.principalAmount,
        currency: metrics.currency,
        status: 'CONFIRMED',
        startDate: metrics.startDate,
        maturityDate: metrics.maturityDate,
        expectedReturnAmount: metrics.expectedReturnAmount,
        expectedTotalPayout: metrics.expectedTotalPayout,
        returnRate: metrics.returnRate,
        certificateId,
        idempotencyKey,
        metadata: {
          ...metadata,
          paymentMethod,
          planSlug: plan.slug,
          planName: plan.name,
          category: plan.category
        }
      }, client);

      // 5. Create immutable Transaction record
      const transaction = await transactionRepository.create({
        referenceId: transactionReference,
        userId,
        type: 'INVESTMENT',
        amount: metrics.principalAmount,
        currency: metrics.currency,
        status: 'SETTLED',
        description: `Allocation of ${metrics.units} units in ${plan.name} (${certificateId})`,
        relatedInvestmentId: investment.id,
        metadata: {
          planId: plan.id,
          planSlug: plan.slug,
          certificateId,
          idempotencyKey,
          paymentMethod
        }
      }, client);

      // 6. Atomically increment plan's total raised
      await planRepository.incrementTotalRaised(plan.id, metrics.principalAmount, client);

      // 7. Audit log event
      await auditRepository.recordLog({
        userId,
        action: 'INVESTMENT_CREATED',
        entityType: 'user_investments',
        entityId: investment.id,
        ipAddress,
        userAgent,
        newState: {
          investmentId: investment.id,
          planId: plan.id,
          amount: metrics.principalAmount,
          units: metrics.units,
          certificateId
        },
        metadata: {
          transactionId: transaction.id,
          referenceId: transactionReference
        }
      }, client);

      logger.info('Investment successfully created and settled', {
        userId,
        investmentId: investment.id,
        planId: plan.id,
        amount: metrics.principalAmount
      });

      return {
        investment: {
          ...investment,
          planSlug: plan.slug,
          planName: plan.name,
          planTicker: plan.ticker,
          planCategory: plan.category,
          planDurationMonths: plan.durationMonths,
          planReturnType: plan.returnType,
          planPayoutFrequency: plan.payoutFrequency
        },
        transaction,
        isDuplicate: false
      };
    });
  },

  /**
   * Retrieves all investments belonging to a user
   * @param {string} userId
   * @param {Object} [options]
   */
  async getUserInvestments(userId, options = {}) {
    if (!userId) {
      const error = new Error('Authenticated user ID is required');
      error.code = 'UNAUTHORIZED';
      error.statusCode = 401;
      throw error;
    }
    return investmentRepository.findByUserId(userId, options);
  },

  /**
   * Retrieves a single investment by ID for an authorized user
   * @param {string} userId
   * @param {string} investmentId
   */
  async getUserInvestmentById(userId, investmentId) {
    if (!userId) {
      const error = new Error('Authenticated user ID is required');
      error.code = 'UNAUTHORIZED';
      error.statusCode = 401;
      throw error;
    }

    const investment = await investmentRepository.findById(investmentId);
    if (!investment) {
      const error = new Error(`Investment '${investmentId}' was not found`);
      error.code = 'INVESTMENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // Strict Authorization check: user may only access their own investment
    if (investment.userId !== userId) {
      const error = new Error('You do not have authorization to view this investment');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    return investment;
  },

  /**
   * Retrieves investment transactions / history for a user
   * @param {string} userId
   * @param {Object} [options]
   */
  async getUserInvestmentHistory(userId, options = {}) {
    if (!userId) {
      const error = new Error('Authenticated user ID is required');
      error.code = 'UNAUTHORIZED';
      error.statusCode = 401;
      throw error;
    }
    return transactionRepository.findByUserId(userId, options);
  },

  /**
   * Retrieves user's investment portfolio summary
   * @param {string} userId
   */
  async getUserPortfolioSummary(userId) {
    if (!userId) {
      const error = new Error('Authenticated user ID is required');
      error.code = 'UNAUTHORIZED';
      error.statusCode = 401;
      throw error;
    }
    return investmentRepository.getUserSummary(userId);
  }
};

module.exports = investmentService;
