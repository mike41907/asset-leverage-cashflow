import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from './database'
import type { CashFlowItem, Collateral, DividendTarget, Liability, Loan, RealEstateAsset, Simulation } from '../domain/models'
import { clearDemoData, deleteCashFlowItem, deleteDividendTarget, deleteLiability, deleteLoanBundle, deleteRealEstate, deleteSimulation, loadAppState, replaceAppState, saveCashFlowItem, saveDividendTarget, saveLiability, saveLoanBundle, saveRealEstate, saveSimulation, saveStock } from './repository'

describe('local repository', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('seeds demo assets into IndexedDB only on first load', async () => {
    const first = await loadAppState()
    expect(first.stocks.map((item) => item.symbol)).toEqual(['0050', '00878'])
    expect(first.cash[0]?.amount).toBe(1_000_000)

    await saveStock({ ...first.stocks[0], symbol: '0050-EDITED', isDemo: false })
    const second = await loadAppState()
    expect(second.stocks.some((item) => item.symbol === '0050-EDITED')).toBe(true)
    expect(second.stocks).toHaveLength(2)
  })

  it('clears only records marked as demo data', async () => {
    const first = await loadAppState()
    await saveStock({ ...first.stocks[0], symbol: '0050-USER', isDemo: false })
    const updated = await loadAppState()
    const cleared = await clearDemoData(updated)

    expect(cleared.stocks.map((item) => item.symbol)).toEqual(['0050-USER'])
    expect(cleared.cash).toHaveLength(0)
  })

  it('persists a loan with its collateral bundle and removes both together', async () => {
    const first = await loadAppState()
    const time = new Date().toISOString()
    const collateral: Collateral = {
      id: 'collateral-test',
      name: '測試擔保品',
      institution: '測試證券',
      stockAssetId: first.stocks[0].id,
      pledgedShares: 500,
      maintenanceFormula: 'market-value-over-loan',
      warningRatioPercent: 160,
      marginCallRatioPercent: 120,
      notes: '',
      createdAt: time,
      updatedAt: time,
    }
    const loan: Loan = {
      id: 'loan-test',
      name: '測試質押借款',
      institution: '測試證券',
      collateralIds: [collateral.id],
      principal: 50_000,
      outstandingBalance: 50_000,
      annualInterestRatePercent: 3,
      borrowedAt: '2026-08-20',
      maturityDate: null,
      repaymentMethod: 'interest-only',
      monthlyPrincipal: 0,
      monthlyInterest: 125,
      warningRatioPercent: 160,
      marginCallRatioPercent: 120,
      notes: '',
      createdAt: time,
      updatedAt: time,
    }

    await saveLoanBundle(loan, [collateral])
    const saved = await loadAppState()
    expect(saved.loans.some((item) => item.id === loan.id)).toBe(true)
    expect(saved.collaterals.some((item) => item.id === collateral.id)).toBe(true)

    await deleteLoanBundle(loan)
    const deleted = await loadAppState()
    expect(deleted.loans.some((item) => item.id === loan.id)).toBe(false)
    expect(deleted.collaterals.some((item) => item.id === collateral.id)).toBe(false)
  })

  it('persists and deletes a cash flow item locally', async () => {
    await loadAppState()
    const item: CashFlowItem = {
      id: 'cashflow-test',
      type: 'income',
      category: '薪資',
      name: '測試薪資',
      monthlyAmount: 50_000,
      linkedAssetId: null,
      isActive: true,
      notes: '只存在本機',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await saveCashFlowItem(item)
    const saved = await loadAppState()
    expect(saved.cashFlowItems).toContainEqual(item)

    await deleteCashFlowItem(item.id)
    const deleted = await loadAppState()
    expect(deleted.cashFlowItems.some((existing) => existing.id === item.id)).toBe(false)
  })

  it('persists and deletes real estate and general liability records locally', async () => {
    const first = await loadAppState()
    const time = new Date().toISOString()
    const asset: RealEstateAsset = {
      id: 'real-estate-test',
      kind: 'real-estate',
      name: '測試自住房',
      propertyType: 'residential',
      currentValueTwd: 12_000_000,
      purchasePriceTwd: 10_000_000,
      monthlyRentalIncomeTwd: 0,
      notes: '',
      createdAt: time,
      updatedAt: time,
    }
    const liability: Liability = {
      id: 'liability-test',
      type: 'mortgage',
      name: '測試房貸',
      institution: '測試銀行',
      linkedAssetId: asset.id,
      principal: 8_000_000,
      outstandingBalance: 7_500_000,
      annualInterestRatePercent: 2.2,
      monthlyPayment: 35_000,
      borrowedAt: '2026-01-01',
      maturityDate: null,
      isActive: true,
      notes: '',
      createdAt: time,
      updatedAt: time,
    }

    await saveRealEstate(asset)
    await saveLiability(liability)
    const saved = await loadAppState()
    expect(saved.realEstate).toContainEqual(asset)
    expect(saved.liabilities).toContainEqual(liability)

    await deleteRealEstate(asset.id)
    await deleteLiability(liability.id)
    const deleted = await loadAppState()
    expect(deleted.realEstate.some((item) => item.id === asset.id)).toBe(false)
    expect(deleted.liabilities.some((item) => item.id === liability.id)).toBe(false)
    expect(first.realEstate).toEqual([])
  })

  it('persists and deletes a passive income target locally', async () => {
    await loadAppState()
    const target: DividendTarget = {
      id: 'target-test',
      name: '測試被動收入目標',
      monthlyNetTarget: 40_000,
      monthlyDebtCost: 5_000,
      incomeMode: 'net',
      mode: 'yield',
      stockAssetId: 'demo-stock-00878',
      symbol: '00878',
      assetName: '國泰永續高股息',
      annualYieldPercent: 5.45,
      annualDividendPerShare: 1.2,
      quarterlyDividends: [0.3, 0.3, 0.3, 0.3],
      currentPrice: 22,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await saveDividendTarget(target)
    const saved = await loadAppState()
    expect(saved.dividendTargets).toContainEqual(target)

    await deleteDividendTarget(target.id)
    const deleted = await loadAppState()
    expect(deleted.dividendTargets.some((existing) => existing.id === target.id)).toBe(false)
  })

  it('persists and deletes a saved simulation scenario locally', async () => {
    await loadAppState()
    const simulation: Simulation = {
      id: 'simulation-test',
      name: '測試方案',
      collateralStockIds: ['demo-stock-0050'],
      loanAmount: 1_000_000,
      annualInterestRatePercent: 3,
      borrowingMonths: 12,
      repaymentMethod: 'interest-only',
      investments: [{
        id: 'simulation-investment-test',
        stockAssetId: 'demo-stock-00878',
        symbol: '00878',
        name: '國泰永續高股息',
        price: 22,
        amount: 1_000_000,
        allocationPercent: 100,
        estimatedYieldPercent: 5.45,
        annualDividendPerShare: 1.2,
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await saveSimulation(simulation)
    const saved = await loadAppState()
    expect(saved.simulations).toContainEqual(simulation)

    await deleteSimulation(simulation.id)
    const deleted = await loadAppState()
    expect(deleted.simulations.some((existing) => existing.id === simulation.id)).toBe(false)
  })

  it('replaces all application stores without leaving old records behind', async () => {
    const first = await loadAppState()
    await saveStock({ ...first.stocks[0], id: 'old-stock', symbol: 'OLD', isDemo: false })

    await replaceAppState({
      ...first,
      stocks: [first.stocks[0]],
      cash: [],
      loans: [],
      collaterals: [],
      cashFlowItems: [],
      simulations: [],
      dividendTargets: [],
    })

    const replaced = await loadAppState()
    expect(replaced.stocks.map((stock) => stock.id)).toEqual([first.stocks[0].id])
    expect(replaced.cash).toHaveLength(0)
    expect(replaced.settings.id).toBe('app')
  })
})
