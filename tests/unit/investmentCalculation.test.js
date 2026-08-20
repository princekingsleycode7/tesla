const investmentCalculationService = require('../../backend/src/services/investmentCalculationService');

describe('Investment Calculation & Precision Engine Unit Tests', () => {
  const equityPlan = {
    id: 'plan-1',
    slug: 'tsla-direct-allocation',
    name: 'Tesla Direct Share Offering Tranche',
    ticker: 'TSLA',
    unitPrice: 248.0000,
    minInvestment: 1000.0000,
    maxInvestment: 5000000.0000,
    durationMonths: 0,
    expectedRoiPercentage: 0.0000,
    returnType: 'CAPITAL_APPRECIATION',
    currency: 'USD'
  };

  const fixedYieldPlan = {
    id: 'plan-2',
    slug: 'tsla-megapack-yield-note',
    name: 'Megapack Clean Energy Infrastructure Note',
    ticker: 'TSLA-ENRG',
    unitPrice: 500.0000,
    minInvestment: 2500.0000,
    maxInvestment: 10000000.0000,
    durationMonths: 36,
    expectedRoiPercentage: 7.8500,
    returnType: 'FIXED_YIELD',
    currency: 'USD'
  };

  const profitSharePlan = {
    id: 'plan-3',
    slug: 'tsla-optimus-robotics-tranche',
    name: 'Optimus Humanoid Robotics Strategic Tranche',
    ticker: 'TSLA-AI',
    unitPrice: 1000.0000,
    minInvestment: 5000.0000,
    maxInvestment: 25000000.0000,
    durationMonths: 48,
    expectedRoiPercentage: 18.5000,
    returnType: 'PROFIT_SHARE',
    currency: 'USD'
  };

  test('Calculates correct units and preserves monetary precision for equity allocation', () => {
    const startDate = new Date('2025-01-01T00:00:00Z');
    const metrics = investmentCalculationService.calculateInvestmentMetrics(equityPlan, 10000, startDate);

    expect(metrics.principalAmount).toBe(10000.0000);
    expect(metrics.pricePerUnit).toBe(248.0000);
    // 10000 / 248 = 40.32258064516... -> 40.322581
    expect(metrics.units).toBe(40.322581);
    expect(metrics.durationMonths).toBe(0);
    expect(metrics.maturityDate).toBeNull();
    expect(metrics.expectedReturnAmount).toBe(0.0000);
    expect(metrics.expectedTotalPayout).toBe(10000.0000);
  });

  test('Calculates annual yield and multi-year returns accurately for fixed yield notes', () => {
    const startDate = new Date('2025-01-01T00:00:00Z');
    const amount = 50000; // $50,000 invested at 7.85% for 36 months (3 years)
    const metrics = investmentCalculationService.calculateInvestmentMetrics(fixedYieldPlan, amount, startDate);

    expect(metrics.principalAmount).toBe(50000.0000);
    expect(metrics.units).toBe(100.000000); // 50000 / 500
    expect(metrics.durationMonths).toBe(36);
    expect(metrics.maturityDate).not.toBeNull();
    // 36 months after 2025-01-01
    expect(metrics.maturityDate.getUTCFullYear()).toBe(2028);

    // 50,000 * 0.0785 * 3 = 11,775.00
    expect(metrics.expectedReturnAmount).toBe(11775.0000);
    expect(metrics.expectedTotalPayout).toBe(61775.0000);
  });

  test('Calculates profit share returns for strategic robotics growth tranche', () => {
    const startDate = new Date('2025-01-01T00:00:00Z');
    const amount = 100000; // $100,000 at 18.5% total return
    const metrics = investmentCalculationService.calculateInvestmentMetrics(profitSharePlan, amount, startDate);

    expect(metrics.principalAmount).toBe(100000.0000);
    expect(metrics.units).toBe(100.000000); // 100000 / 1000
    // 100,000 * 0.185 = 18,500.00
    expect(metrics.expectedReturnAmount).toBe(18500.0000);
    expect(metrics.expectedTotalPayout).toBe(118500.0000);
  });

  test('Rejects invalid, zero, or negative investment amounts', () => {
    expect(() => {
      investmentCalculationService.calculateInvestmentMetrics(equityPlan, -100);
    }).toThrow('Investment amount must be a positive number');

    expect(() => {
      investmentCalculationService.calculateInvestmentMetrics(equityPlan, 0);
    }).toThrow('Investment amount must be a positive number');

    expect(() => {
      investmentCalculationService.calculateInvestmentMetrics(equityPlan, 'invalid');
    }).toThrow('Investment amount must be a positive number');
  });

  test('Generates unique certificate IDs and transaction references', () => {
    const cert1 = investmentCalculationService.generateCertificateId('TSLA');
    const cert2 = investmentCalculationService.generateCertificateId('TSLA');
    expect(cert1).toMatch(/^TSLA-CERT-/);
    expect(cert2).toMatch(/^TSLA-CERT-/);
    expect(cert1).not.toBe(cert2);

    const ref1 = investmentCalculationService.generateTransactionReference('INV');
    const ref2 = investmentCalculationService.generateTransactionReference('INV');
    expect(ref1).toMatch(/^TX-INV-/);
    expect(ref2).toMatch(/^TX-INV-/);
    expect(ref1).not.toBe(ref2);
  });
});
