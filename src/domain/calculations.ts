import type { CashAsset, CashFlowItem, Loan, StockAsset } from './models'

export interface PortfolioSummary {
  stockMarketValueTwd: number
  cashValueTwd: number
  totalAssetsTwd: number
  totalLiabilitiesTwd: number
  netWorthTwd: number
  annualEstimatedDividendTwd: number
  monthlyEstimatedDividendTwd: number
  monthlyLoanInterestTwd: number
  monthlyCashFlowTwd: number
  debtRatioPercent: number
  leverageRatio: number
}

export interface StressTestInput {
  stockMarketValueTwd: number
  collateralValueTwd: number
  totalAssetsTwd: number
  totalLiabilitiesTwd: number
  loanBalanceTwd: number
  dropPercent: number
}

export interface StressTestResult {
  dropPercent: number
  stockMarketValueTwd: number
  collateralValueTwd: number
  totalAssetsTwd: number
  netWorthTwd: number
  netWorthDropPercent: number
  maintenanceRatioPercent: number
}

export interface DividendTargetResult {
  monthlyGrossTargetTwd: number
  annualTargetTwd: number
  requiredPrincipalTwd: number | null
}

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export function calculateStockMarketValue(stock: StockAsset): number {
  return finitePositive(stock.shares) * finitePositive(stock.currentPrice) * finitePositive(stock.exchangeRateToTwd || 1)
}

export function calculateStockCostBasis(stock: StockAsset): number {
  return finitePositive(stock.shares) * finitePositive(stock.averageCost) * finitePositive(stock.exchangeRateToTwd || 1)
}

export function calculateStockUnrealizedGain(stock: StockAsset): number {
  return calculateStockMarketValue(stock) - calculateStockCostBasis(stock)
}

export function calculateStockUnrealizedGainPercent(stock: StockAsset): number | null {
  const costBasis = calculateStockCostBasis(stock)
  return costBasis > 0 ? (calculateStockUnrealizedGain(stock) / costBasis) * 100 : null
}

export function calculateCashValue(cash: CashAsset): number {
  return finitePositive(cash.amount) * finitePositive(cash.exchangeRateToTwd || 1)
}

export function calculateAnnualDividendTwd(stock: StockAsset): number {
  const perShareDividend = finitePositive(stock.estimatedAnnualDividendPerShare)
  if (perShareDividend > 0) {
    return finitePositive(stock.shares) * perShareDividend * finitePositive(stock.exchangeRateToTwd || 1)
  }

  return calculateStockMarketValue(stock) * (finitePositive(stock.estimatedYieldPercent) / 100)
}

export function calculateTotalAssets(
  stocks: readonly StockAsset[],
  cash: readonly CashAsset[],
  additionalAssetValueTwd = 0,
): number {
  return sum(stocks.map(calculateStockMarketValue)) + sum(cash.map(calculateCashValue)) + finitePositive(additionalAssetValueTwd)
}

export function calculateNetWorth(totalAssetsTwd: number, totalLiabilitiesTwd: number): number {
  return totalAssetsTwd - finitePositive(totalLiabilitiesTwd)
}

export function calculateLoanInterest(loanBalance: number, annualInterestRatePercent: number): number {
  return finitePositive(loanBalance) * (finitePositive(annualInterestRatePercent) / 100)
}

export function calculateMonthlyLoanInterest(loanBalance: number, annualInterestRatePercent: number): number {
  return calculateLoanInterest(loanBalance, annualInterestRatePercent) / 12
}

export function calculateMaintenanceRatio(collateralValueTwd: number, loanBalanceTwd: number): number {
  return loanBalanceTwd > 0 ? (finitePositive(collateralValueTwd) / loanBalanceTwd) * 100 : Number.POSITIVE_INFINITY
}

export function calculateLeverageRatio(totalAssetsTwd: number, netWorthTwd: number): number {
  return netWorthTwd > 0 ? finitePositive(totalAssetsTwd) / netWorthTwd : Number.POSITIVE_INFINITY
}

export function calculateMonthlyCashFlow(
  incomeItems: readonly CashFlowItem[],
  expenseItems: readonly CashFlowItem[],
  investmentIncomeTwd = 0,
  debtServiceTwd = 0,
): number {
  const monthlyIncome = sum(incomeItems.filter((item) => item.isActive).map((item) => finitePositive(item.monthlyAmount)))
  const monthlyExpenses = sum(expenseItems.filter((item) => item.isActive).map((item) => finitePositive(item.monthlyAmount)))
  return monthlyIncome + finitePositive(investmentIncomeTwd) - monthlyExpenses - finitePositive(debtServiceTwd)
}

export function calculateDividendTarget(
  monthlyNetTargetTwd: number,
  annualYieldPercent: number,
  monthlyDebtCostTwd = 0,
): DividendTargetResult {
  const monthlyGrossTargetTwd = finitePositive(monthlyNetTargetTwd) + finitePositive(monthlyDebtCostTwd)
  const annualTargetTwd = monthlyGrossTargetTwd * 12
  const yieldRate = finitePositive(annualYieldPercent) / 100

  return {
    monthlyGrossTargetTwd,
    annualTargetTwd,
    requiredPrincipalTwd: yieldRate > 0 ? annualTargetTwd / yieldRate : null,
  }
}

export function calculateRequiredShares(
  annualIncomeTargetTwd: number,
  annualDividendPerShare: number,
  exchangeRateToTwd = 1,
): number | null {
  const annualDividendTwdPerShare = finitePositive(annualDividendPerShare) * finitePositive(exchangeRateToTwd || 1)
  if (annualDividendTwdPerShare <= 0 || annualIncomeTargetTwd <= 0) return null
  return Math.ceil(annualIncomeTargetTwd / annualDividendTwdPerShare)
}

export function calculateStressTest(input: StressTestInput): StressTestResult {
  const factor = Math.max(0, 1 - finitePositive(input.dropPercent) / 100)
  const stockMarketValueTwd = finitePositive(input.stockMarketValueTwd) * factor
  const collateralValueTwd = finitePositive(input.collateralValueTwd) * factor
  const totalAssetsTwd = Math.max(0, finitePositive(input.totalAssetsTwd) - finitePositive(input.stockMarketValueTwd) + stockMarketValueTwd)
  const originalNetWorthTwd = calculateNetWorth(input.totalAssetsTwd, input.totalLiabilitiesTwd)
  const netWorthTwd = calculateNetWorth(totalAssetsTwd, input.totalLiabilitiesTwd)

  return {
    dropPercent: Math.min(100, finitePositive(input.dropPercent)),
    stockMarketValueTwd,
    collateralValueTwd,
    totalAssetsTwd,
    netWorthTwd,
    netWorthDropPercent: originalNetWorthTwd > 0 ? ((originalNetWorthTwd - netWorthTwd) / originalNetWorthTwd) * 100 : 0,
    maintenanceRatioPercent: calculateMaintenanceRatio(collateralValueTwd, input.loanBalanceTwd),
  }
}

export function calculateMarginCallDrop(
  collateralValueTwd: number,
  loanBalanceTwd: number,
  thresholdRatioPercent: number,
): number | null {
  const collateral = finitePositive(collateralValueTwd)
  const loan = finitePositive(loanBalanceTwd)
  const threshold = finitePositive(thresholdRatioPercent)
  if (collateral <= 0 || loan <= 0 || threshold <= 0) return null

  const requiredCollateral = loan * (threshold / 100)
  return requiredCollateral >= collateral ? 0 : Math.min(100, Math.max(0, (1 - requiredCollateral / collateral) * 100))
}

export function calculatePortfolioSummary(
  stocks: readonly StockAsset[],
  cash: readonly CashAsset[],
  loans: readonly Loan[],
  cashFlowItems: readonly CashFlowItem[],
): PortfolioSummary {
  const stockMarketValueTwd = sum(stocks.map(calculateStockMarketValue))
  const cashValueTwd = sum(cash.map(calculateCashValue))
  const totalAssetsTwd = calculateTotalAssets(stocks, cash)
  const totalLiabilitiesTwd = sum(loans.map((loan) => finitePositive(loan.outstandingBalance)))
  const netWorthTwd = calculateNetWorth(totalAssetsTwd, totalLiabilitiesTwd)
  const annualEstimatedDividendTwd = sum(stocks.map(calculateAnnualDividendTwd))
  const monthlyEstimatedDividendTwd = annualEstimatedDividendTwd / 12
  const monthlyLoanInterestTwd = sum(
    loans.map((loan) => loan.monthlyInterest > 0 ? loan.monthlyInterest : calculateMonthlyLoanInterest(loan.outstandingBalance, loan.annualInterestRatePercent)),
  )
  const incomeItems = cashFlowItems.filter((item) => item.type === 'income')
  const expenseItems = cashFlowItems.filter((item) => item.type === 'expense')
  const monthlyCashFlowTwd = calculateMonthlyCashFlow(incomeItems, expenseItems, monthlyEstimatedDividendTwd, monthlyLoanInterestTwd)

  return {
    stockMarketValueTwd,
    cashValueTwd,
    totalAssetsTwd,
    totalLiabilitiesTwd,
    netWorthTwd,
    annualEstimatedDividendTwd,
    monthlyEstimatedDividendTwd,
    monthlyLoanInterestTwd,
    monthlyCashFlowTwd,
    debtRatioPercent: totalAssetsTwd > 0 ? (totalLiabilitiesTwd / totalAssetsTwd) * 100 : 0,
    leverageRatio: calculateLeverageRatio(totalAssetsTwd, netWorthTwd),
  }
}
