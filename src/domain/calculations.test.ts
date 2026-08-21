import {
  calculateCollateralSelectionsValueTwd,
  calculateDividendTarget,
  calculateMaintenanceRatio,
  calculateMaintenanceStatus,
  calculateMarginCallDrop,
  calculateNetWorth,
  calculateMonthlyCashFlow,
  calculateMonthlyCashFlowBreakdown,
  calculatePerShareDividendTarget,
  calculatePortfolioSummary,
  calculateRequiredShares,
  calculateReinvestmentSimulation,
  calculateScenarioComparison,
  calculateStressTest,
  calculateTotalAssets,
} from './calculations'
import type { CashAsset, CashFlowItem, Loan, StockAsset } from './models'

const stock = (overrides: Partial<StockAsset> = {}): StockAsset => ({
  id: 'stock-1',
  kind: 'stock',
  symbol: 'TEST',
  name: '測試股票',
  market: 'TW',
  currency: 'TWD',
  exchangeRateToTwd: 1,
  shares: 1000,
  averageCost: 5000,
  currentPrice: 5000,
  estimatedAnnualDividendPerShare: 0,
  estimatedYieldPercent: 0,
  asCollateral: false,
  notes: '',
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

const cash: CashAsset = {
  id: 'cash-1',
  kind: 'cash',
  label: '現金',
  currency: 'TWD',
  amount: 1_000_000,
  exchangeRateToTwd: 1,
  notes: '',
  createdAt: '',
  updatedAt: '',
}

describe('portfolio calculations', () => {
  it('keeps borrowed money out of net worth while reflecting reinvested assets', () => {
    const totalAssets = calculateTotalAssets([stock({ shares: 1000, currentPrice: 5000 })], [cash], 2_000_000)
    expect(totalAssets).toBe(8_000_000)
    expect(calculateNetWorth(totalAssets, 2_000_000)).toBe(6_000_000)
  })

  it('calculates a 200% maintenance ratio', () => {
    expect(calculateMaintenanceRatio(3_000_000, 1_500_000)).toBe(200)
  })

  it('values only the pledged shares, capped at the shares actually held', () => {
    expect(calculateCollateralSelectionsValueTwd([{ stockAssetId: 'stock-1', pledgedShares: 1200 }], [stock({ shares: 1000, currentPrice: 300 })])).toBe(300_000)
  })

  it('maps maintenance ratio to configurable safe, warning, and danger states', () => {
    expect(calculateMaintenanceStatus(200, 160, 120)).toBe('safe')
    expect(calculateMaintenanceStatus(150, 160, 120)).toBe('warning')
    expect(calculateMaintenanceStatus(100, 160, 120)).toBe('danger')
  })

  it('calculates the required principal for a dividend target', () => {
    const result = calculateDividendTarget(40_000, 7)
    expect(result.annualTargetTwd).toBe(480_000)
    expect(result.requiredPrincipalTwd).toBeCloseTo(6_857_142.857, 2)
  })

  it('supports net income targets by adding debt cost to gross income required', () => {
    const result = calculateDividendTarget(40_000, 7, 5_000)
    expect(result.monthlyGrossTargetTwd).toBe(45_000)
    expect(result.annualTargetTwd).toBe(540_000)
  })

  it('rounds required shares up to a whole share', () => {
    expect(calculateRequiredShares(480_000, 6.5)).toBe(73_847)
  })

  it('calculates required shares and principal from four quarterly dividends', () => {
    const result = calculatePerShareDividendTarget(480_000, [1, 1, 1, 1], 20)

    expect(result.annualDividendPerShareTwd).toBe(4)
    expect(result.requiredShares).toBe(120_000)
    expect(result.requiredPrincipalTwd).toBe(2_400_000)
  })

  it('returns no per-share target when dividends or price are missing', () => {
    expect(calculatePerShareDividendTarget(480_000, [0, 0, 0, 0], 20)).toMatchObject({
      annualDividendPerShareTwd: 0,
      requiredShares: null,
      requiredPrincipalTwd: null,
    })
    expect(calculatePerShareDividendTarget(480_000, [1, 1, 1, 1], 0).requiredPrincipalTwd).toBeNull()
  })

  it('separates manual cash flow, investment income, and debt service', () => {
    const items: CashFlowItem[] = [
      { id: 'salary', type: 'income' as const, category: '薪資', name: '薪資', monthlyAmount: 50_000, linkedAssetId: null, isActive: true, notes: '', createdAt: '', updatedAt: '' },
      { id: 'living', type: 'expense' as const, category: '固定生活費', name: '生活費', monthlyAmount: 20_000, linkedAssetId: null, isActive: true, notes: '', createdAt: '', updatedAt: '' },
      { id: 'paused', type: 'expense' as const, category: '其他支出', name: '暫停項目', monthlyAmount: 10_000, linkedAssetId: null, isActive: false, notes: '', createdAt: '', updatedAt: '' },
    ]
    const breakdown = calculateMonthlyCashFlowBreakdown(items, 10_000, 3_000, 2_000)

    expect(breakdown.manualIncomeTwd).toBe(50_000)
    expect(breakdown.manualExpenseTwd).toBe(20_000)
    expect(breakdown.totalIncomeTwd).toBe(60_000)
    expect(breakdown.totalExpenseTwd).toBe(25_000)
    expect(breakdown.netCashFlowTwd).toBe(35_000)
    expect(calculateMonthlyCashFlow([items[0]], [items[1], items[2]], 10_000, 5_000)).toBe(35_000)
  })

  it('includes dividend income and loan principal in the portfolio cash flow', () => {
    const loan: Loan = {
      id: 'loan-cashflow',
      name: '現金流測試借款',
      institution: '測試機構',
      collateralIds: [],
      principal: 100_000,
      outstandingBalance: 100_000,
      annualInterestRatePercent: 12,
      borrowedAt: '2026-01-01',
      maturityDate: null,
      repaymentMethod: 'equal-principal',
      monthlyPrincipal: 2_000,
      monthlyInterest: 1_000,
      warningRatioPercent: 160,
      marginCallRatioPercent: 120,
      notes: '',
      createdAt: '',
      updatedAt: '',
    }
    const items: CashFlowItem[] = [{ id: 'salary', type: 'income', category: '薪資', name: '薪資', monthlyAmount: 50_000, linkedAssetId: null, isActive: true, notes: '', createdAt: '', updatedAt: '' }, { id: 'expense', type: 'expense', category: '固定生活費', name: '生活費', monthlyAmount: 10_000, linkedAssetId: null, isActive: true, notes: '', createdAt: '', updatedAt: '' }]
    const summary = calculatePortfolioSummary([stock({ shares: 1_000, currentPrice: 100, estimatedAnnualDividendPerShare: 12 })], [cash], [loan], items)

    expect(summary.monthlyIncomeTwd).toBe(50_000)
    expect(summary.monthlyExpenseTwd).toBe(10_000)
    expect(summary.monthlyEstimatedDividendTwd).toBe(1_000)
    expect(summary.monthlyLoanInterestTwd).toBe(1_000)
    expect(summary.monthlyLoanPrincipalTwd).toBe(2_000)
    expect(summary.monthlyDebtServiceTwd).toBe(3_000)
    expect(summary.monthlyCashFlowTwd).toBe(38_000)
  })

  it('calculates stress-test values and maintenance ratio after a drop', () => {
    const result = calculateStressTest({
      stockMarketValueTwd: 5_000_000,
      collateralValueTwd: 3_000_000,
      totalAssetsTwd: 6_000_000,
      totalLiabilitiesTwd: 1_500_000,
      loanBalanceTwd: 1_500_000,
      dropPercent: 20,
    })
    expect(result.stockMarketValueTwd).toBe(4_000_000)
    expect(result.totalAssetsTwd).toBe(5_000_000)
    expect(result.netWorthTwd).toBe(3_500_000)
    expect(result.maintenanceRatioPercent).toBe(160)
  })

  it('finds the drop that reaches a warning line', () => {
    expect(calculateMarginCallDrop(3_000_000, 1_500_000, 160)).toBeCloseTo(20, 5)
  })

  it('handles a threshold that is already crossed and caps extreme stress inputs', () => {
    expect(calculateMarginCallDrop(1_000_000, 1_000_000, 160)).toBe(0)
    expect(calculateStressTest({
      stockMarketValueTwd: 5_000_000,
      collateralValueTwd: 3_000_000,
      totalAssetsTwd: 6_000_000,
      totalLiabilitiesTwd: 1_500_000,
      loanBalanceTwd: 1_500_000,
      dropPercent: 150,
    })).toMatchObject({ dropPercent: 100, stockMarketValueTwd: 0, collateralValueTwd: 0 })
  })

  it('compares a borrowed reinvestment before and after without changing initial net worth', () => {
    const result = calculateReinvestmentSimulation({
      base: {
        stockMarketValueTwd: 5_000_000,
        cashValueTwd: 1_000_000,
        totalAssetsTwd: 6_000_000,
        totalLiabilitiesTwd: 0,
        netWorthTwd: 6_000_000,
        annualEstimatedDividendTwd: 60_000,
        monthlyCashFlowTwd: 5_000,
        debtRatioPercent: 0,
        leverageRatio: 1,
      },
      loanAmountTwd: 2_000_000,
      annualInterestRatePercent: 3,
      targetStock: stock({ symbol: '00878', currentPrice: 50, estimatedAnnualDividendPerShare: 2.5 }),
      investmentAllocationPercent: 100,
      collateralValueTwd: 5_000_000,
      warningRatioPercent: 160,
      marginCallRatioPercent: 120,
    })

    expect(result.sharesPurchased).toBe(40_000)
    expect(result.newInvestmentMarketValueTwd).toBe(2_000_000)
    expect(result.annualDividendTwd).toBe(100_000)
    expect(result.monthlyInterestTwd).toBeCloseTo(5_000, 5)
    expect(result.after.totalAssetsTwd).toBe(8_000_000)
    expect(result.after.totalLiabilitiesTwd).toBe(2_000_000)
    expect(result.after.netWorthTwd).toBe(result.before.netWorthTwd)
    expect(result.after.debtRatioPercent).toBe(25)
    expect(result.after.leverageRatio).toBeCloseTo(1.333333, 5)
    expect(result.monthlyNetCashFlowTwd).toBeCloseTo(8_333.333, 2)
    expect(result.maintenanceRatioPercent).toBe(250)
  })

  it('compares a saved scenario across base, -20%, and -30% market stress', () => {
    const result = calculateScenarioComparison({
      base: {
        stockMarketValueTwd: 5_000_000,
        cashValueTwd: 1_000_000,
        totalAssetsTwd: 6_000_000,
        totalLiabilitiesTwd: 0,
        netWorthTwd: 6_000_000,
        annualEstimatedDividendTwd: 60_000,
        monthlyCashFlowTwd: 5_000,
        debtRatioPercent: 0,
        leverageRatio: 1,
      },
      loanAmountTwd: 2_000_000,
      annualInterestRatePercent: 3,
      targetStock: stock({ symbol: '00878', currentPrice: 50, estimatedAnnualDividendPerShare: 2.5 }),
      investmentAllocationPercent: 100,
      collateralValueTwd: 5_000_000,
      warningRatioPercent: 160,
      marginCallRatioPercent: 120,
    })

    expect(result.simulation.after.netWorthTwd).toBe(6_000_000)
    expect(result.stress20.netWorthTwd).toBe(4_600_000)
    expect(result.stress20Maintenance.ratioPercent).toBeCloseTo(200, 5)
    expect(result.stress30Maintenance.ratioPercent).toBeCloseTo(175, 5)
    expect(result.marginCallDropPercent).toBeCloseTo(52, 5)
  })
})
