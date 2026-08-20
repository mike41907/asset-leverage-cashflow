import {
  calculateCollateralSelectionsValueTwd,
  calculateDividendTarget,
  calculateMaintenanceRatio,
  calculateMaintenanceStatus,
  calculateMarginCallDrop,
  calculateNetWorth,
  calculateRequiredShares,
  calculateStressTest,
  calculateTotalAssets,
} from './calculations'
import type { CashAsset, StockAsset } from './models'

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
})
