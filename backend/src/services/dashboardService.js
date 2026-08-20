const investmentRepository = require('../repositories/investmentRepository');
const transactionRepository = require('../repositories/transactionRepository');
const paymentRepository = require('../repositories/paymentRepository');
const auditRepository = require('../repositories/auditRepository');

/**
 * Service for aggregated User Dashboard metrics and section data.
 */
class DashboardService {
  /**
   * Retrieves aggregated dashboard overview for the authenticated user
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getOverview(userId) {
    if (!userId) {
      throw new Error('User ID is required for dashboard aggregation');
    }

    // Run aggregations concurrently
    const [
      investmentSummary,
      pendingPaymentsSummary,
      recentInvestments,
      recentTransactions,
      recentPayments,
      recentActivity,
      totalTxCount,
      totalActivityCount
    ] = await Promise.all([
      investmentRepository.getUserSummary(userId),
      paymentRepository.getPendingSummary(userId),
      investmentRepository.findByUserId(userId, { limit: 5 }),
      transactionRepository.findByUserId(userId, { limit: 5 }),
      paymentRepository.findByUserId(userId, { limit: 5 }),
      auditRepository.findByUserId(userId, { limit: 5 }),
      transactionRepository.countByUserId(userId),
      auditRepository.countByUserId(userId)
    ]);

    const totalInvested = Number(investmentSummary.totalInvestedAmount || 0);
    const totalReturns = Number(investmentSummary.totalProjectedReturns || 0);
    const totalPayout = Number(investmentSummary.totalProjectedPayout || (totalInvested + totalReturns));
    const portfolioValue = totalPayout > 0 ? totalPayout : totalInvested;

    return {
      summary: {
        totalInvested: totalInvested.toFixed(2),
        activeInvestments: investmentSummary.activeCount || 0,
        portfolioValue: portfolioValue.toFixed(2),
        returns: totalReturns.toFixed(2),
        pendingTransactions: pendingPaymentsSummary.count || 0,
        pendingAmount: Number(pendingPaymentsSummary.totalAmount || 0).toFixed(2),
        totalTransactions: totalTxCount,
        totalActivities: totalActivityCount
      },
      recentInvestments: recentInvestments || [],
      recentTransactions: recentTransactions || [],
      recentPayments: recentPayments || [],
      recentActivity: recentActivity || []
    };
  }

  /**
   * Gets paginated user investments
   * @param {string} userId
   * @param {Object} queryParams
   */
  async getInvestments(userId, { status, page = 1, limit = 10 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const [investments, summary] = await Promise.all([
      investmentRepository.findByUserId(userId, { status, limit: limitNum, offset }),
      investmentRepository.getUserSummary(userId)
    ]);

    const total = status
      ? (status === 'ACTIVE' || status === 'CONFIRMED' ? summary.activeCount : summary.totalCount)
      : summary.totalCount;

    return {
      investments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  }

  /**
   * Gets paginated user transactions
   * @param {string} userId
   * @param {Object} queryParams
   */
  async getTransactions(userId, { type, status, page = 1, limit = 10 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      transactionRepository.findByUserId(userId, { type, status, limit: limitNum, offset }),
      transactionRepository.countByUserId(userId, { type, status })
    ]);

    return {
      transactions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  }

  /**
   * Gets paginated user payments
   * @param {string} userId
   * @param {Object} queryParams
   */
  async getPayments(userId, { status, page = 1, limit = 10 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const [payments, total] = await Promise.all([
      paymentRepository.findByUserId(userId, { status, limit: limitNum, offset }),
      paymentRepository.countByUserId(userId, { status })
    ]);

    return {
      payments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  }

  /**
   * Gets paginated user activity audit logs
   * @param {string} userId
   * @param {Object} queryParams
   */
  async getActivity(userId, { page = 1, limit = 10 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const [activities, total] = await Promise.all([
      auditRepository.findByUserId(userId, { limit: limitNum, offset }),
      auditRepository.countByUserId(userId)
    ]);

    return {
      activities,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  }
}

module.exports = new DashboardService();
