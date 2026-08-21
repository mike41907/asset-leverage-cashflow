export const CURRENT_SCHEMA_VERSION = 2 as const

export type Currency = 'TWD' | 'USD'
export type Market = 'TW' | 'US' | 'OTHER'
export type ThemeMode = 'system' | 'light' | 'dark'
export type NumberDisplayMode = 'exact' | 'compact'
export type AssetKind = 'stock' | 'cash' | 'real-estate' | 'other'
export type CashFlowType = 'income' | 'expense'
export type RepaymentMethod = 'interest-only' | 'equal-principal' | 'amortized'
export type DividendIncomeMode = 'gross' | 'net'
export type StockPriceSource = 'manual' | 'yahoo-public'
export type RealEstateType = 'residential' | 'commercial' | 'land' | 'other'
export type LiabilityType = 'mortgage' | 'car-loan' | 'personal-loan' | 'credit' | 'other'

export interface Asset {
  id: string
  kind: AssetKind
  createdAt: string
  updatedAt: string
  isDemo?: boolean
}

export interface StockAsset extends Asset {
  kind: 'stock'
  symbol: string
  name: string
  market: Market
  currency: Currency
  exchangeRateToTwd: number
  shares: number
  averageCost: number
  currentPrice: number
  /** Price provenance is optional so V1.0 backups remain backward compatible. */
  currentPriceSource?: StockPriceSource
  currentPriceFetchedAt?: string
  currentPriceMarketAt?: string
  estimatedAnnualDividendPerShare: number
  estimatedYieldPercent: number
  asCollateral: boolean
  notes: string
}

export interface CashAsset extends Asset {
  kind: 'cash'
  label: string
  currency: Currency
  amount: number
  exchangeRateToTwd: number
  notes: string
}

export interface RealEstateAsset extends Asset {
  kind: 'real-estate'
  name: string
  propertyType: RealEstateType
  currentValueTwd: number
  purchasePriceTwd: number
  monthlyRentalIncomeTwd: number
  notes: string
}

export interface Liability {
  id: string
  type: LiabilityType
  name: string
  institution: string
  linkedAssetId: string | null
  principal: number
  outstandingBalance: number
  annualInterestRatePercent: number
  monthlyPayment: number
  borrowedAt: string
  maturityDate: string | null
  isActive: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Loan {
  id: string
  name: string
  institution: string
  collateralIds: string[]
  principal: number
  outstandingBalance: number
  annualInterestRatePercent: number
  borrowedAt: string
  maturityDate: string | null
  repaymentMethod: RepaymentMethod
  monthlyPrincipal: number
  monthlyInterest: number
  warningRatioPercent: number
  marginCallRatioPercent: number
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Collateral {
  id: string
  name: string
  institution: string
  stockAssetId: string
  pledgedShares: number
  maintenanceFormula: 'market-value-over-loan'
  warningRatioPercent: number
  marginCallRatioPercent: number
  notes: string
  createdAt: string
  updatedAt: string
}

export interface CashFlowItem {
  id: string
  type: CashFlowType
  category: string
  name: string
  monthlyAmount: number
  linkedAssetId: string | null
  isActive: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface SimulationInvestment {
  id: string
  stockAssetId: string | null
  symbol: string
  name: string
  price: number
  amount: number
  allocationPercent: number
  estimatedYieldPercent: number
  annualDividendPerShare: number
}

export interface Simulation {
  id: string
  name: string
  collateralStockIds: string[]
  loanAmount: number
  annualInterestRatePercent: number
  borrowingMonths: number
  repaymentMethod: RepaymentMethod
  investments: SimulationInvestment[]
  createdAt: string
  updatedAt: string
}

export interface DividendTarget {
  id: string
  name: string
  monthlyNetTarget: number
  monthlyDebtCost: number
  incomeMode: DividendIncomeMode
  mode: 'yield' | 'per-share'
  stockAssetId: string | null
  symbol: string
  assetName: string
  annualYieldPercent: number
  annualDividendPerShare: number
  quarterlyDividends: number[]
  currentPrice: number
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  id: 'app'
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  baseCurrency: 'TWD'
  themeMode: ThemeMode
  numberDisplayMode: NumberDisplayMode
  maintenanceWarningRatioPercent: number
  maintenanceMarginCallRatioPercent: number
  hasSeenDemoNotice: boolean
  updatedAt: string
}

export interface BackupData {
  backupVersion: typeof CURRENT_SCHEMA_VERSION
  exportedAt: string
  stocks: StockAsset[]
  cash: CashAsset[]
  realEstate: RealEstateAsset[]
  loans: Loan[]
  liabilities: Liability[]
  collaterals: Collateral[]
  cashFlowItems: CashFlowItem[]
  simulations: Simulation[]
  dividendTargets: DividendTarget[]
  settings: AppSettings
}

export interface AppState {
  stocks: StockAsset[]
  cash: CashAsset[]
  realEstate: RealEstateAsset[]
  loans: Loan[]
  liabilities: Liability[]
  collaterals: Collateral[]
  cashFlowItems: CashFlowItem[]
  simulations: Simulation[]
  dividendTargets: DividendTarget[]
  settings: AppSettings
}

export type PageKey = 'dashboard' | 'assets' | 'simulation' | 'cashflow' | 'settings'

export function createDefaultSettings(now = new Date().toISOString()): AppSettings {
  return {
    id: 'app',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    baseCurrency: 'TWD',
    themeMode: 'system',
    numberDisplayMode: 'exact',
    maintenanceWarningRatioPercent: 160,
    maintenanceMarginCallRatioPercent: 120,
    hasSeenDemoNotice: false,
    updatedAt: now,
  }
}
