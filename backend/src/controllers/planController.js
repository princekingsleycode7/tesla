const investmentService = require('../services/investmentService');
const { successResponse } = require('../utils/apiResponse');

/**
 * Controller for Investment Plans / Offerings
 */
const planController = {
  /**
   * GET /api/v1/plans or /api/v1/investments/plans
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
   * GET /api/v1/plans/:idOrSlug
   */
  async getPlanById(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const plan = await investmentService.getPlan(idOrSlug);

      return res.status(200).json(successResponse({ plan }));
    } catch (err) {
      next(err);
    }
  }
};

module.exports = planController;
