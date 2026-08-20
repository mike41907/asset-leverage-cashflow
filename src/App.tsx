import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { calculatePortfolioSummary } from './domain/calculations'
import type { AppState, AppSettings, CashAsset, Collateral, Loan, PageKey, StockAsset } from './domain/models'
import { clearDemoData, deleteCash, deleteLoanBundle, deleteStock, loadAppState, saveCash, saveLoanBundle, saveSettings, saveStock } from './data/repository'
import { DashboardPage } from './pages/DashboardPage'
import { AssetsPage } from './pages/AssetsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { LoanManagementPage } from './pages/LoanManagementPage'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '本機資料操作失敗，請重新整理後再試。'
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

  if (!state) {
    return <div className="loading-screen"><div className="loading-mark"><span /><span /><span /></div><strong>正在開啟你的本機資產資料庫…</strong>{error && <p role="alert">{error}</p>}</div>
  }

  const page = summary && activePage === 'dashboard' ? <DashboardPage state={state} summary={summary} onNavigate={setActivePage} />
    : activePage === 'assets' ? <AssetsPage stocks={state.stocks} cash={state.cash} displayMode={state.settings.numberDisplayMode} onSaveStock={handleSaveStock} onDeleteStock={handleDeleteStock} onSaveCash={handleSaveCash} onDeleteCash={handleDeleteCash} />
      : activePage === 'settings' ? <SettingsPage settings={state.settings} hasDemoData={state.stocks.some((item) => item.isDemo) || state.cash.some((item) => item.isDemo)} onUpdateSettings={handleUpdateSettings} onClearDemoData={handleClearDemoData} />
        : activePage === 'simulation' ? <LoanManagementPage stocks={state.stocks} loans={state.loans} collaterals={state.collaterals} settings={state.settings} summary={summary ?? calculatePortfolioSummary(state.stocks, state.cash, state.loans, state.cashFlowItems, state.collaterals, state.settings.maintenanceWarningRatioPercent, state.settings.maintenanceMarginCallRatioPercent)} displayMode={state.settings.numberDisplayMode} onSaveLoan={handleSaveLoan} onDeleteLoan={handleDeleteLoan} />
          : <ComingSoonPage icon={CircleDollarSign} eyebrow="現金流規劃 / V0.5" title="把股息，放回每月生活裡。" description="現金流模組會整合薪資、股息、固定支出與借款成本，讓被動收入目標不只停留在殖利率。" phase="V0.5" features={['收入與支出項目可分開管理', '股息與利息成本獨立列示', '淨領目標與所需本金計算器']} onNavigate={setActivePage} />

  return <AppShell activePage={activePage} onNavigate={(nextPage) => { setActivePage(nextPage); setError(null) }}><div className="page-content-wrap">{page}</div>{error && <div className="toast toast-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="關閉錯誤訊息">×</button></div>}{notice && <div className="toast toast-success" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="關閉成功訊息">×</button></div>}</AppShell>
}
