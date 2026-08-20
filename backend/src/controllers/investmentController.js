const investmentService = require('../services/investmentService');
const { successResponse } = require('../utils/apiResponse');

/**
 * Controller for User Investments
 */
const investmentController = {
  /**
   * GET /api/v1/investments/plans
   */
  async getPlans(req, res, next) {
    try {
      const { status = 'ACTIVE', category, limit, offset } = req.query;
      const plans = await investmentService.getAvailablePlans({
        status: status === 'ALL' ? undefined : status,
        category,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      return res.status(200).json(successResponse({ plans }));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/investments
   * Lists authenticated user's investments
   */
  async getUserInvestments(req, res, next) {
    try {
      const userId = req.user.id;
      const { status, limit, offset } = req.query;

      const investments = await investmentService.getUserInvestments(userId, {
        status,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      return res.status(200).json(successResponse({ investments }));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/investments/summary
   * Portfolio summary for authenticated user
   */
  async getPortfolioSummary(req, res, next) {
    try {
      const userId = req.user.id;
      const summary = await investmentService.getUserPortfolioSummary(userId);

      return res.status(200).json(successResponse({ summary }));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/investments/history
   * Transaction and ledger history for authenticated user
   */
  async getInvestmentHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const { type, status, limit, offset } = req.query;

      const history = await investmentService.getUserInvestmentHistory(userId, {
        type,
        status,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      return res.status(200).json(successResponse({ history }));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/investments/:id
   * Retrieves a single investment with strict user authorization
   */
  async getUserInvestmentById(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const investment = await investmentService.getUserInvestmentById(userId, id);

      return res.status(200).json(successResponse({ investment }));
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/investments
   * Creates a new investment allocation for authenticated user
   */
  async createInvestment(req, res, next) {
    try {
      const userId = req.user.id;
      const { planId, plan_id, slug, amount, paymentMethod, payment_method, metadata } = req.body || {};
      
      const targetPlan = planId || plan_id || slug;
      const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || req.body?.idempotency_key;

      const meta = {
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      const result = await investmentService.createInvestment({
        userId,
        planId: targetPlan,
        amount,
        idempotencyKey,
        paymentMethod: paymentMethod || payment_method || 'DIRECT_ALLOCATION',
        metadata: metadata || {},
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      });

      const statusCode = result.isDuplicate ? 200 : 201;
      return res.status(statusCode).json(successResponse({
        investment: result.investment,
        transaction: result.transaction,
        isDuplicate: result.isDuplicate
      }));
    } catch (err) {
      next(err);
    }
  }
};

module.exports = investmentController;
