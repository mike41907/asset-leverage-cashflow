import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './components/AppShell'
import { calculatePortfolioSummary } from './domain/calculations'
import type { AppState, AppSettings, BackupData, CashAsset, CashFlowItem, Collateral, DividendTarget, Loan, PageKey, Simulation, StockAsset } from './domain/models'
import { backupToAppState, createBackupData, mergeBackupIntoAppState, serializeBackupData, type BackupImportMode } from './data/backup'
import { clearDemoData, deleteCash, deleteCashFlowItem, deleteDividendTarget, deleteLoanBundle, deleteSimulation, deleteStock, loadAppState, replaceAppState, saveAppState, saveCash, saveCashFlowItem, saveDividendTarget, saveLoanBundle, saveSettings, saveSimulation, saveStock } from './data/repository'
import { DashboardPage } from './pages/DashboardPage'
import { AssetsPage } from './pages/AssetsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoanManagementPage } from './pages/LoanManagementPage'
import { CashFlowPage } from './pages/CashFlowPage'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '本機資料操作失敗，請重新整理後再試。'
}

function downloadBackupFile(state: AppState): void {
  const backup = createBackupData(state)
  const fileDate = backup.exportedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const blob = new Blob([serializeBackupData(backup)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `asset-leverage-cashflow-backup-${fileDate}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void loadAppState().then(setState).catch((loadError: unknown) => setError(getErrorMessage(loadError)))
  }, [])

  useEffect(() => {
    if (!state) return
    const theme = state.settings.themeMode
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.dataset.theme = theme
    }
  }, [state?.settings.themeMode])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const summary = useMemo(() => state ? calculatePortfolioSummary(
    state.stocks,
    state.cash,
    state.loans,
    state.cashFlowItems,
    state.collaterals,
    state.settings.maintenanceWarningRatioPercent,
    state.settings.maintenanceMarginCallRatioPercent,
  ) : null, [state])

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    try {
      await action()
      setNotice(successMessage)
      setError(null)
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    }
  }

  const handleSaveStock = (stock: StockAsset) => runAction(async () => {
    await saveStock(stock)
    setState((current) => current ? { ...current, stocks: current.stocks.some((item) => item.id === stock.id) ? current.stocks.map((item) => item.id === stock.id ? stock : item) : [...current.stocks, stock] } : current)
  }, '股票資產已儲存。')

  const handleDeleteStock = (id: string) => runAction(async () => {
    await deleteStock(id)
    setState((current) => current ? { ...current, stocks: current.stocks.filter((item) => item.id !== id) } : current)
  }, '股票資產已刪除。')

  const handleSaveCash = (cash: CashAsset) => runAction(async () => {
    await saveCash(cash)
    setState((current) => current ? { ...current, cash: current.cash.some((item) => item.id === cash.id) ? current.cash.map((item) => item.id === cash.id ? cash : item) : [...current.cash, cash] } : current)
  }, '現金資產已儲存。')

  const handleDeleteCash = (id: string) => runAction(async () => {
    await deleteCash(id)
    setState((current) => current ? { ...current, cash: current.cash.filter((item) => item.id !== id) } : current)
  }, '現金資產已刪除。')

  const handleSaveCashFlowItem = (item: CashFlowItem) => runAction(async () => {
    await saveCashFlowItem(item)
    setState((current) => current ? {
      ...current,
      cashFlowItems: current.cashFlowItems.some((existing) => existing.id === item.id)
        ? current.cashFlowItems.map((existing) => existing.id === item.id ? item : existing)
        : [...current.cashFlowItems, item],
    } : current)
  }, '現金流項目已儲存。')

  const handleDeleteCashFlowItem = (item: CashFlowItem) => runAction(async () => {
    await deleteCashFlowItem(item.id)
    setState((current) => current ? { ...current, cashFlowItems: current.cashFlowItems.filter((existing) => existing.id !== item.id) } : current)
  }, '現金流項目已刪除。')

  const handleSaveDividendTarget = (target: DividendTarget) => runAction(async () => {
    await saveDividendTarget(target)
    setState((current) => current ? {
      ...current,
      dividendTargets: current.dividendTargets.some((existing) => existing.id === target.id)
        ? current.dividendTargets.map((existing) => existing.id === target.id ? target : existing)
        : [...current.dividendTargets, target],
    } : current)
  }, '被動收入目標已儲存。')

  const handleDeleteDividendTarget = (target: DividendTarget) => runAction(async () => {
    await deleteDividendTarget(target.id)
    setState((current) => current ? { ...current, dividendTargets: current.dividendTargets.filter((existing) => existing.id !== target.id) } : current)
  }, '被動收入目標已刪除。')

  const handleSaveSimulation = (simulation: Simulation) => runAction(async () => {
    await saveSimulation(simulation)
    setState((current) => current ? {
      ...current,
      simulations: current.simulations.some((existing) => existing.id === simulation.id)
        ? current.simulations.map((existing) => existing.id === simulation.id ? simulation : existing)
        : [...current.simulations, simulation],
    } : current)
  }, '模擬方案已儲存。')

  const handleDeleteSimulation = (simulation: Simulation) => runAction(async () => {
    await deleteSimulation(simulation.id)
    setState((current) => current ? { ...current, simulations: current.simulations.filter((existing) => existing.id !== simulation.id) } : current)
  }, '模擬方案已刪除。')

  const handleSaveLoan = (loan: Loan, collaterals: Collateral[], removedCollateralIds: string[]) => runAction(async () => {
    await saveLoanBundle(loan, collaterals, removedCollateralIds)
    setState((current) => current ? {
      ...current,
      loans: current.loans.some((item) => item.id === loan.id)
        ? current.loans.map((item) => item.id === loan.id ? loan : item)
        : [...current.loans, loan],
      collaterals: [
        ...current.collaterals.filter((item) => !removedCollateralIds.includes(item.id) && !collaterals.some((next) => next.id === item.id)),
        ...collaterals,
      ],
    } : current)
  }, '質押借款已儲存。')

  const handleDeleteLoan = (loan: Loan) => runAction(async () => {
    await deleteLoanBundle(loan)
    setState((current) => current ? {
      ...current,
      loans: current.loans.filter((item) => item.id !== loan.id),
      collaterals: current.collaterals.filter((item) => !loan.collateralIds.includes(item.id)),
    } : current)
  }, '質押借款已刪除。')

  const handleUpdateSettings = (settings: AppSettings) => runAction(async () => {
    await saveSettings(settings)
    setState((current) => current ? { ...current, settings } : current)
  }, '設定已更新。')

  const handleClearDemoData = () => runAction(async () => {
    if (!state) return
    const nextState = await clearDemoData(state)
    await saveSettings(nextState.settings)
    setState(nextState)
  }, '示範資料已清除。')

  const handleExportBackup = () => {
    if (!state) return
    downloadBackupFile(state)
    setError(null)
    setNotice('備份 JSON 已下載。')
  }

  const handleImportBackup = (backup: BackupData, mode: BackupImportMode) => runAction(async () => {
    if (!state) return
    const nextState = mode === 'replace' ? backupToAppState(backup) : mergeBackupIntoAppState(state, backup)
    if (mode === 'replace') {
      await replaceAppState(nextState)
    } else {
      await saveAppState(nextState)
    }
    setState(nextState)
  }, mode === 'replace' ? '備份已覆蓋本機資料。' : '備份已合併到本機資料。')

  if (!state) {
    return <div className="loading-screen"><div className="loading-mark"><span /><span /><span /></div><strong>正在開啟你的本機資產資料庫…</strong>{error && <p role="alert">{error}</p>}</div>
  }

  const page = summary && activePage === 'dashboard' ? <DashboardPage state={state} summary={summary} onNavigate={setActivePage} />
    : activePage === 'assets' ? <AssetsPage stocks={state.stocks} cash={state.cash} displayMode={state.settings.numberDisplayMode} onSaveStock={handleSaveStock} onDeleteStock={handleDeleteStock} onSaveCash={handleSaveCash} onDeleteCash={handleDeleteCash} />
        : activePage === 'settings' ? <SettingsPage settings={state.settings} hasDemoData={state.stocks.some((item) => item.isDemo) || state.cash.some((item) => item.isDemo)} onUpdateSettings={handleUpdateSettings} onClearDemoData={handleClearDemoData} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} />
        : activePage === 'simulation' ? <LoanManagementPage stocks={state.stocks} loans={state.loans} collaterals={state.collaterals} simulations={state.simulations} settings={state.settings} summary={summary ?? calculatePortfolioSummary(state.stocks, state.cash, state.loans, state.cashFlowItems, state.collaterals, state.settings.maintenanceWarningRatioPercent, state.settings.maintenanceMarginCallRatioPercent)} displayMode={state.settings.numberDisplayMode} onSaveLoan={handleSaveLoan} onDeleteLoan={handleDeleteLoan} onSaveSimulation={handleSaveSimulation} onDeleteSimulation={handleDeleteSimulation} />
          : <CashFlowPage items={state.cashFlowItems} loans={state.loans} stocks={state.stocks} targets={state.dividendTargets} summary={summary ?? calculatePortfolioSummary(state.stocks, state.cash, state.loans, state.cashFlowItems, state.collaterals, state.settings.maintenanceWarningRatioPercent, state.settings.maintenanceMarginCallRatioPercent)} displayMode={state.settings.numberDisplayMode} onSaveItem={handleSaveCashFlowItem} onDeleteItem={handleDeleteCashFlowItem} onSaveTarget={handleSaveDividendTarget} onDeleteTarget={handleDeleteDividendTarget} />

  return <AppShell activePage={activePage} onNavigate={(nextPage) => { setActivePage(nextPage); setError(null) }}><div className="page-content-wrap">{page}</div>{error && <div className="toast toast-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="關閉錯誤訊息">×</button></div>}{notice && <div className="toast toast-success" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="關閉成功訊息">×</button></div>}</AppShell>
}
