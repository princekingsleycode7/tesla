const dashboardService = require('../services/dashboardService');

/**
 * Controller for Authenticated User Dashboard endpoints
 */
class DashboardController {
  /**
   * GET /api/v1/dashboard/overview
   */
  async getOverview(req, res, next) {
    try {
      const data = await dashboardService.getOverview(req.user.id);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/dashboard/investments
   */
  async getInvestments(req, res, next) {
    try {
      const data = await dashboardService.getInvestments(req.user.id, req.query);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/dashboard/transactions
   */
  async getTransactions(req, res, next) {
    try {
      const data = await dashboardService.getTransactions(req.user.id, req.query);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/dashboard/payments
   */
  async getPayments(req, res, next) {
    try {
      const data = await dashboardService.getPayments(req.user.id, req.query);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/dashboard/activity
   */
  async getActivity(req, res, next) {
    try {
      const data = await dashboardService.getActivity(req.user.id, req.query);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DashboardController();
