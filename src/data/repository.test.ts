import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from './database'
import type { CashFlowItem, Collateral, Loan } from '../domain/models'
import { clearDemoData, deleteCashFlowItem, deleteLoanBundle, loadAppState, saveCashFlowItem, saveLoanBundle, saveStock } from './repository'

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
})
