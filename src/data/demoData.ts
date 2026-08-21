import { createDefaultSettings, type AppState, type CashAsset, type StockAsset } from '../domain/models'

const demoTime = '2026-01-01T00:00:00.000Z'

export function createDemoState(): AppState {
  const stocks: StockAsset[] = [
    {
      id: 'demo-stock-0050',
      kind: 'stock',
      symbol: '0050',
      name: '元大台灣50',
      market: 'TW',
      currency: 'TWD',
      exchangeRateToTwd: 1,
      shares: 1000,
      averageCost: 160,
      currentPrice: 190,
      estimatedAnnualDividendPerShare: 6.5,
      estimatedYieldPercent: 3.42,
      asCollateral: true,
      notes: '示範資料：價格與配息皆為手動輸入。',
      createdAt: demoTime,
      updatedAt: demoTime,
      isDemo: true,
    },
    {
      id: 'demo-stock-00878',
      kind: 'stock',
      symbol: '00878',
      name: '國泰永續高股息',
      market: 'TW',
      currency: 'TWD',
      exchangeRateToTwd: 1,
      shares: 5000,
      averageCost: 18,
      currentPrice: 22,
      estimatedAnnualDividendPerShare: 1.2,
      estimatedYieldPercent: 5.45,
      asCollateral: false,
      notes: '示範資料：價格與配息皆為手動輸入。',
      createdAt: demoTime,
      updatedAt: demoTime,
      isDemo: true,
    },
  ]

  const cash: CashAsset[] = [
    {
      id: 'demo-cash-twd',
      kind: 'cash',
      label: '日常備用現金',
      currency: 'TWD',
      amount: 1_000_000,
      exchangeRateToTwd: 1,
      notes: '示範資料。',
      createdAt: demoTime,
      updatedAt: demoTime,
      isDemo: true,
    },
  ]

  return {
    stocks,
    cash,
    cryptos: [],
    realEstate: [],
    loans: [],
    liabilities: [],
    collaterals: [],
    cashFlowItems: [],
    simulations: [],
    dividendTargets: [],
    settings: createDefaultSettings(demoTime),
  }
}
