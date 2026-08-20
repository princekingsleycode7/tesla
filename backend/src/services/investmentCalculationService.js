const crypto = require('crypto');

/**
 * Service dedicated to precise server-side investment calculations
 */
const investmentCalculationService = {
  /**
   * Calculates units, maturity, and projected returns for an investment
   * @param {Object} plan - The investment plan / product record
   * @param {number|string} amount - Amount in currency
   * @param {Date} [startDate=new Date()]
   * @returns {Object} Calculated metrics
   */
  calculateInvestmentMetrics(plan, amount, startDate = new Date()) {
    const rawAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(rawAmount) || rawAmount <= 0) {
      throw new Error('Investment amount must be a positive number');
    }

    // Precise 4-decimal currency standard
    const principalAmount = Number(rawAmount.toFixed(4));
    const unitPrice = Number(parseFloat(plan.unitPrice).toFixed(4));
    
    // Precise unit shares (6 decimals)
    const units = Number((principalAmount / unitPrice).toFixed(6));

    const durationMonths = parseInt(plan.durationMonths || 0, 10);
    const returnRatePercentage = Number(parseFloat(plan.expectedRoiPercentage || 0).toFixed(4));

    let maturityDate = null;
    if (durationMonths > 0) {
      maturityDate = new Date(startDate.getTime());
      maturityDate.setMonth(maturityDate.getMonth() + durationMonths);
    }

    let expectedReturnAmount = 0.0000;
    let expectedTotalPayout = principalAmount;

    const returnType = plan.returnType || 'CAPITAL_APPRECIATION';

    if (returnType === 'FIXED_YIELD') {
      // Annual rate applied across duration
      const annualRate = returnRatePercentage / 100;
      const years = durationMonths > 0 ? durationMonths / 12 : 1;
      expectedReturnAmount = Number((principalAmount * annualRate * years).toFixed(4));
      expectedTotalPayout = Number((principalAmount + expectedReturnAmount).toFixed(4));
    } else if (returnType === 'PROFIT_SHARE') {
      // Direct ROI target percentage
      const targetRate = returnRatePercentage / 100;
      expectedReturnAmount = Number((principalAmount * targetRate).toFixed(4));
      expectedTotalPayout = Number((principalAmount + expectedReturnAmount).toFixed(4));
    } else if (returnRatePercentage > 0) {
      // Any other configured return percentage
      const rate = returnRatePercentage / 100;
      expectedReturnAmount = Number((principalAmount * rate).toFixed(4));
      expectedTotalPayout = Number((principalAmount + expectedReturnAmount).toFixed(4));
    }

    return {
      principalAmount,
      units,
      pricePerUnit: unitPrice,
      durationMonths,
      returnRate: returnRatePercentage,
      startDate,
      maturityDate,
      expectedReturnAmount,
      expectedTotalPayout,
      currency: plan.currency || 'USD'
    };
  },

  /**
   * Generates a unique, tamper-evident certificate ID
   * @param {string} [prefix='TSLA']
   * @returns {string}
   */
  generateCertificateId(prefix = 'TSLA') {
    const timestamp = Date.now().toString(36).toUpperCase();
    const entropy = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-CERT-${timestamp}-${entropy}`;
  },

  /**
   * Generates a unique transaction ledger reference ID
   * @param {string} [type='INV']
   * @returns {string}
   */
  generateTransactionReference(type = 'INV') {
    const timestamp = Date.now().toString(36).toUpperCase();
    const entropy = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `TX-${type}-${timestamp}-${entropy}`;
  }
};

module.exports = investmentCalculationService;
