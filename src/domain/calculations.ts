import type { CashAsset, CashFlowItem, Collateral, Liability, Loan, RealEstateAsset, StockAsset } from './models'

export type MaintenanceStatus = 'safe' | 'warning' | 'danger' | 'unavailable'

export interface MaintenanceOverview {
  collateralValueTwd: number
  loanBalanceTwd: number
  ratioPercent: number
  status: MaintenanceStatus
  distanceToWarningPoints: number | null
  distanceToMarginCallPoints: number | null
}

export interface CollateralSelection {
  stockAssetId: string
  pledgedShares: number
}

export interface PortfolioSummary {
  stockMarketValueTwd: number
  cashValueTwd: number
  realEstateValueTwd: number
  totalAssetsTwd: number
  totalLiabilitiesTwd: number
  netWorthTwd: number
  annualEstimatedDividendTwd: number
  monthlyEstimatedDividendTwd: number
  monthlyRentalIncomeTwd: number
  monthlyIncomeTwd: number
  monthlyExpenseTwd: number
  monthlyLoanInterestTwd: number
  monthlyLoanPrincipalTwd: number
  monthlyLiabilityPaymentTwd: number
  monthlyDebtServiceTwd: number
  monthlyCashFlowTwd: number
  debtRatioPercent: number
  leverageRatio: number
  collateralValueTwd: number
  maintenanceRatioPercent: number
  maintenanceStatus: MaintenanceStatus
  distanceToWarningPoints: number | null
  distanceToMarginCallPoints: number | null
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

export interface SimulationSnapshot {
  stockMarketValueTwd: number
  cashValueTwd: number
  totalAssetsTwd: number
  totalLiabilitiesTwd: number
  netWorthTwd: number
  annualEstimatedDividendTwd: number
  monthlyCashFlowTwd: number
  debtRatioPercent: number
  leverageRatio: number
}

export interface ReinvestmentSimulationInput {
  base: SimulationSnapshot
  loanAmountTwd: number
  annualInterestRatePercent: number
  targetStock: StockAsset | null
  investmentAllocationPercent: number
  collateralValueTwd: number
  warningRatioPercent: number
  marginCallRatioPercent: number
}

export interface ReinvestmentSimulationResult {
  loanAmountTwd: number
  annualInterestTwd: number
  monthlyInterestTwd: number
  investmentAllocationPercent: number
  plannedInvestmentAmountTwd: number
  sharesPurchased: number
  newInvestmentMarketValueTwd: number
  uninvestedBorrowedCashTwd: number
  annualDividendTwd: number
  monthlyDividendTwd: number
  monthlyNetCashFlowTwd: number
  maintenanceRatioPercent: number
  maintenanceStatus: MaintenanceStatus
  distanceToWarningPoints: number | null
  distanceToMarginCallPoints: number | null
  before: SimulationSnapshot
  after: SimulationSnapshot
}

export interface ScenarioComparisonInput {
  base: SimulationSnapshot
  loanAmountTwd: number
  annualInterestRatePercent: number
  targetStock: StockAsset | null
  investmentAllocationPercent: number
  collateralValueTwd: number
  warningRatioPercent: number
  marginCallRatioPercent: number
}

export interface ScenarioComparisonResult {
  simulation: ReinvestmentSimulationResult
  stress20: StressTestResult
  stress30: StressTestResult
  stress20Maintenance: MaintenanceOverview
  stress30Maintenance: MaintenanceOverview
  marginCallDropPercent: number | null
}

export interface DividendTargetResult {
  monthlyGrossTargetTwd: number
  annualTargetTwd: number
  requiredPrincipalTwd: number | null
}

export interface PerShareDividendTargetResult {
  annualDividendPerShareTwd: number
  requiredShares: number | null
  requiredPrincipalTwd: number | null
}

export interface MonthlyCashFlowBreakdown {
  manualIncomeTwd: number
  manualExpenseTwd: number
  investmentIncomeTwd: number
  rentalIncomeTwd: number
  loanInterestTwd: number
  loanPrincipalTwd: number
  liabilityPaymentTwd: number
  totalIncomeTwd: number
  totalExpenseTwd: number
  netCashFlowTwd: number
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

export function calculateRealEstateValueTwd(asset: RealEstateAsset): number {
  return finitePositive(asset.currentValueTwd)
}

export function calculateCollateralValueTwd(collateral: Collateral, stocks: readonly StockAsset[]): number {
  const stock = stocks.find((item) => item.id === collateral.stockAssetId)
  if (!stock) return 0

  return Math.min(finitePositive(collateral.pledgedShares), finitePositive(stock.shares)) * finitePositive(stock.currentPrice) * finitePositive(stock.exchangeRateToTwd || 1)
}

export function calculateCollateralSelectionsValueTwd(
  selections: readonly CollateralSelection[],
  stocks: readonly StockAsset[],
): number {
  return sum(selections.map((selection) => {
    const stock = stocks.find((item) => item.id === selection.stockAssetId)
    if (!stock) return 0
    return Math.min(finitePositive(selection.pledgedShares), finitePositive(stock.shares)) * finitePositive(stock.currentPrice) * finitePositive(stock.exchangeRateToTwd || 1)
  }))
}

export function calculateTotalCollateralValueTwd(
  collaterals: readonly Collateral[],
  stocks: readonly StockAsset[],
): number {
  return sum(collaterals.map((collateral) => calculateCollateralValueTwd(collateral, stocks)))
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
  realEstate: readonly RealEstateAsset[] = [],
): number {
  return sum(stocks.map(calculateStockMarketValue)) + sum(cash.map(calculateCashValue)) + sum(realEstate.map(calculateRealEstateValueTwd)) + finitePositive(additionalAssetValueTwd)
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

export function calculateMaintenanceStatus(
  ratioPercent: number,
  warningRatioPercent: number,
  marginCallRatioPercent: number,
): MaintenanceStatus {
  if (ratioPercent === Number.POSITIVE_INFINITY || !Number.isFinite(ratioPercent)) return 'unavailable'
  if (ratioPercent < finitePositive(marginCallRatioPercent)) return 'danger'
  if (ratioPercent < finitePositive(warningRatioPercent)) return 'warning'
  return 'safe'
}

export function calculateMaintenanceOverview(
  collateralValueTwd: number,
  loanBalanceTwd: number,
  warningRatioPercent: number,
  marginCallRatioPercent: number,
): MaintenanceOverview {
  const ratioPercent = calculateMaintenanceRatio(collateralValueTwd, loanBalanceTwd)
  const status = calculateMaintenanceStatus(ratioPercent, warningRatioPercent, marginCallRatioPercent)

  return {
    collateralValueTwd,
    loanBalanceTwd,
    ratioPercent,
    status,
    distanceToWarningPoints: status === 'unavailable' ? null : ratioPercent - warningRatioPercent,
    distanceToMarginCallPoints: status === 'unavailable' ? null : ratioPercent - marginCallRatioPercent,
  }
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

export function calculateMonthlyCashFlowBreakdown(
  cashFlowItems: readonly CashFlowItem[],
  investmentIncomeTwd = 0,
  loanInterestTwd = 0,
  loanPrincipalTwd = 0,
  liabilityPaymentTwd = 0,
  rentalIncomeTwd = 0,
): MonthlyCashFlowBreakdown {
  const manualIncomeTwd = sum(cashFlowItems.filter((item) => item.type === 'income' && item.isActive).map((item) => finitePositive(item.monthlyAmount)))
  const manualExpenseTwd = sum(cashFlowItems.filter((item) => item.type === 'expense' && item.isActive).map((item) => finitePositive(item.monthlyAmount)))
  const safeInvestmentIncomeTwd = finitePositive(investmentIncomeTwd)
  const safeLoanInterestTwd = finitePositive(loanInterestTwd)
  const safeLoanPrincipalTwd = finitePositive(loanPrincipalTwd)
  const safeLiabilityPaymentTwd = finitePositive(liabilityPaymentTwd)
  const safeRentalIncomeTwd = finitePositive(rentalIncomeTwd)
  const totalIncomeTwd = manualIncomeTwd + safeInvestmentIncomeTwd + safeRentalIncomeTwd
  const totalExpenseTwd = manualExpenseTwd + safeLoanInterestTwd + safeLoanPrincipalTwd + safeLiabilityPaymentTwd

  return {
    manualIncomeTwd,
    manualExpenseTwd,
    investmentIncomeTwd: safeInvestmentIncomeTwd,
    rentalIncomeTwd: safeRentalIncomeTwd,
    loanInterestTwd: safeLoanInterestTwd,
    loanPrincipalTwd: safeLoanPrincipalTwd,
    liabilityPaymentTwd: safeLiabilityPaymentTwd,
    totalIncomeTwd,
    totalExpenseTwd,
    netCashFlowTwd: totalIncomeTwd - totalExpenseTwd,
  }
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

export function calculatePerShareDividendTarget(
  annualIncomeTargetTwd: number,
  quarterlyDividends: readonly number[],
  currentPriceTwd: number,
): PerShareDividendTargetResult {
  const annualDividendPerShareTwd = sum(quarterlyDividends.map(finitePositive))
  const requiredShares = calculateRequiredShares(annualIncomeTargetTwd, annualDividendPerShareTwd)
  const safeCurrentPriceTwd = finitePositive(currentPriceTwd)

  return {
    annualDividendPerShareTwd,
    requiredShares,
    requiredPrincipalTwd: requiredShares !== null && safeCurrentPriceTwd > 0 ? requiredShares * safeCurrentPriceTwd : null,
  }
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

function calculateDebtRatioPercent(totalAssetsTwd: number, totalLiabilitiesTwd: number): number {
  return totalAssetsTwd > 0 ? (finitePositive(totalLiabilitiesTwd) / totalAssetsTwd) * 100 : 0
}

function createSimulationSnapshot(input: Omit<SimulationSnapshot, 'netWorthTwd' | 'debtRatioPercent' | 'leverageRatio'>): SimulationSnapshot {
  const netWorthTwd = calculateNetWorth(input.totalAssetsTwd, input.totalLiabilitiesTwd)
  return {
    ...input,
    netWorthTwd,
    debtRatioPercent: calculateDebtRatioPercent(input.totalAssetsTwd, input.totalLiabilitiesTwd),
    leverageRatio: calculateLeverageRatio(input.totalAssetsTwd, netWorthTwd),
  }
}

export function calculateReinvestmentSimulation(input: ReinvestmentSimulationInput): ReinvestmentSimulationResult {
  const loanAmountTwd = finitePositive(input.loanAmountTwd)
  const annualInterestTwd = calculateLoanInterest(loanAmountTwd, input.annualInterestRatePercent)
  const monthlyInterestTwd = annualInterestTwd / 12
  const investmentAllocationPercent = Math.min(100, Math.max(0, finitePositive(input.investmentAllocationPercent)))
  const plannedInvestmentAmountTwd = loanAmountTwd * (investmentAllocationPercent / 100)
  const exchangeRateToTwd = input.targetStock ? finitePositive(input.targetStock.exchangeRateToTwd || 1) : 1
  const targetPriceTwd = input.targetStock ? finitePositive(input.targetStock.currentPrice) * exchangeRateToTwd : 0
  const sharesPurchased = targetPriceTwd > 0 ? Math.floor(plannedInvestmentAmountTwd / targetPriceTwd) : 0
  const newInvestmentMarketValueTwd = sharesPurchased * targetPriceTwd
  const uninvestedBorrowedCashTwd = Math.max(0, loanAmountTwd - newInvestmentMarketValueTwd)
  const annualDividendTwd = input.targetStock && sharesPurchased > 0
    ? calculateAnnualDividendTwd({ ...input.targetStock, shares: sharesPurchased })
    : 0
  const monthlyDividendTwd = annualDividendTwd / 12
  const maintenanceOverview = calculateMaintenanceOverview(
    input.collateralValueTwd,
    loanAmountTwd,
    input.warningRatioPercent,
    input.marginCallRatioPercent,
  )
  const before = input.base
  const after = createSimulationSnapshot({
    stockMarketValueTwd: before.stockMarketValueTwd + newInvestmentMarketValueTwd,
    cashValueTwd: before.cashValueTwd + uninvestedBorrowedCashTwd,
    totalAssetsTwd: before.totalAssetsTwd + loanAmountTwd,
    totalLiabilitiesTwd: before.totalLiabilitiesTwd + loanAmountTwd,
    annualEstimatedDividendTwd: before.annualEstimatedDividendTwd + annualDividendTwd,
    monthlyCashFlowTwd: before.monthlyCashFlowTwd + monthlyDividendTwd - monthlyInterestTwd,
  })

  return {
    loanAmountTwd,
    annualInterestTwd,
    monthlyInterestTwd,
    investmentAllocationPercent,
    plannedInvestmentAmountTwd,
    sharesPurchased,
    newInvestmentMarketValueTwd,
    uninvestedBorrowedCashTwd,
    annualDividendTwd,
    monthlyDividendTwd,
    monthlyNetCashFlowTwd: after.monthlyCashFlowTwd,
    maintenanceRatioPercent: maintenanceOverview.ratioPercent,
    maintenanceStatus: maintenanceOverview.status,
    distanceToWarningPoints: maintenanceOverview.distanceToWarningPoints,
    distanceToMarginCallPoints: maintenanceOverview.distanceToMarginCallPoints,
    before,
    after,
  }
}

export function calculateScenarioComparison(input: ScenarioComparisonInput): ScenarioComparisonResult {
  const simulation = calculateReinvestmentSimulation({
    base: input.base,
    loanAmountTwd: input.loanAmountTwd,
    annualInterestRatePercent: input.annualInterestRatePercent,
    targetStock: input.targetStock,
    investmentAllocationPercent: input.investmentAllocationPercent,
    collateralValueTwd: input.collateralValueTwd,
    warningRatioPercent: input.warningRatioPercent,
    marginCallRatioPercent: input.marginCallRatioPercent,
  })

  const createStress = (dropPercent: number): StressTestResult => calculateStressTest({
    stockMarketValueTwd: simulation.after.stockMarketValueTwd,
    collateralValueTwd: input.collateralValueTwd,
    totalAssetsTwd: simulation.after.totalAssetsTwd,
    totalLiabilitiesTwd: simulation.after.totalLiabilitiesTwd,
    loanBalanceTwd: simulation.after.totalLiabilitiesTwd,
    dropPercent,
  })
  const stress20 = createStress(20)
  const stress30 = createStress(30)
  const stress20Maintenance = calculateMaintenanceOverview(stress20.collateralValueTwd, simulation.after.totalLiabilitiesTwd, input.warningRatioPercent, input.marginCallRatioPercent)
  const stress30Maintenance = calculateMaintenanceOverview(stress30.collateralValueTwd, simulation.after.totalLiabilitiesTwd, input.warningRatioPercent, input.marginCallRatioPercent)

  return {
    simulation,
    stress20,
    stress30,
    stress20Maintenance,
    stress30Maintenance,
    marginCallDropPercent: calculateMarginCallDrop(input.collateralValueTwd, simulation.after.totalLiabilitiesTwd, input.marginCallRatioPercent),
  }
}

export function calculatePortfolioSummary(
  stocks: readonly StockAsset[],
  cash: readonly CashAsset[],
  loans: readonly Loan[],
  cashFlowItems: readonly CashFlowItem[],
  collaterals: readonly Collateral[] = [],
  warningRatioPercent = 160,
  marginCallRatioPercent = 120,
  realEstate: readonly RealEstateAsset[] = [],
  liabilities: readonly Liability[] = [],
): PortfolioSummary {
  const stockMarketValueTwd = sum(stocks.map(calculateStockMarketValue))
  const cashValueTwd = sum(cash.map(calculateCashValue))
  const realEstateValueTwd = sum(realEstate.map(calculateRealEstateValueTwd))
  const totalAssetsTwd = calculateTotalAssets(stocks, cash, 0, realEstate)
  const totalLiabilitiesTwd = sum(loans.map((loan) => finitePositive(loan.outstandingBalance))) + sum(liabilities.filter((liability) => liability.isActive).map((liability) => finitePositive(liability.outstandingBalance)))
  const netWorthTwd = calculateNetWorth(totalAssetsTwd, totalLiabilitiesTwd)
  const annualEstimatedDividendTwd = sum(stocks.map(calculateAnnualDividendTwd))
  const monthlyEstimatedDividendTwd = annualEstimatedDividendTwd / 12
  const monthlyRentalIncomeTwd = sum(realEstate.map((asset) => finitePositive(asset.monthlyRentalIncomeTwd)))
  const monthlyIncomeTwd = sum(cashFlowItems.filter((item) => item.type === 'income' && item.isActive).map((item) => finitePositive(item.monthlyAmount))) + monthlyRentalIncomeTwd
  const monthlyExpenseTwd = sum(cashFlowItems.filter((item) => item.type === 'expense' && item.isActive).map((item) => finitePositive(item.monthlyAmount)))
  const monthlyLoanInterestTwd = sum(
    loans.map((loan) => loan.monthlyInterest > 0 ? loan.monthlyInterest : calculateMonthlyLoanInterest(loan.outstandingBalance, loan.annualInterestRatePercent)),
  )
  const monthlyLoanPrincipalTwd = sum(loans.map((loan) => finitePositive(loan.monthlyPrincipal)))
  const monthlyLiabilityPaymentTwd = sum(liabilities.filter((liability) => liability.isActive).map((liability) => finitePositive(liability.monthlyPayment)))
  const monthlyDebtServiceTwd = monthlyLoanInterestTwd + monthlyLoanPrincipalTwd + monthlyLiabilityPaymentTwd
  const collateralValueTwd = calculateTotalCollateralValueTwd(collaterals, stocks)
  const maintenanceOverview = calculateMaintenanceOverview(collateralValueTwd, totalLiabilitiesTwd, warningRatioPercent, marginCallRatioPercent)
  const monthlyCashFlowBreakdown = calculateMonthlyCashFlowBreakdown(cashFlowItems, monthlyEstimatedDividendTwd, monthlyLoanInterestTwd, monthlyLoanPrincipalTwd, monthlyLiabilityPaymentTwd, monthlyRentalIncomeTwd)

  return {
    stockMarketValueTwd,
    cashValueTwd,
    realEstateValueTwd,
    totalAssetsTwd,
    totalLiabilitiesTwd,
    netWorthTwd,
    annualEstimatedDividendTwd,
    monthlyEstimatedDividendTwd,
    monthlyRentalIncomeTwd,
    monthlyIncomeTwd,
    monthlyExpenseTwd,
    monthlyLoanInterestTwd,
    monthlyLoanPrincipalTwd,
    monthlyLiabilityPaymentTwd,
    monthlyDebtServiceTwd,
    monthlyCashFlowTwd: monthlyCashFlowBreakdown.netCashFlowTwd,
    debtRatioPercent: totalAssetsTwd > 0 ? (totalLiabilitiesTwd / totalAssetsTwd) * 100 : 0,
    leverageRatio: calculateLeverageRatio(totalAssetsTwd, netWorthTwd),
    collateralValueTwd,
    maintenanceRatioPercent: maintenanceOverview.ratioPercent,
    maintenanceStatus: maintenanceOverview.status,
    distanceToWarningPoints: maintenanceOverview.distanceToWarningPoints,
    distanceToMarginCallPoints: maintenanceOverview.distanceToMarginCallPoints,
  }
}
