import { useMemo, useState, type FormEvent } from 'react'
import { BarChart3, Check, ChevronDown, Copy, Edit3, Info, Plus, ShieldCheck, Target, Trash2, TrendingDown } from 'lucide-react'
import type { AppSettings, RepaymentMethod, Simulation, SimulationInvestment, StockAsset } from '../domain/models'
import {
  calculateCollateralSelectionsValueTwd,
  calculateScenarioComparison,
  calculateStockMarketValue,
  type MaintenanceStatus,
  type PortfolioSummary,
  type ScenarioComparisonResult,
  type SimulationSnapshot,
} from '../domain/calculations'
import { formatCurrencyWithSign, formatNumber, formatPercent, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'

interface ScenarioComparisonProps {
  stocks: StockAsset[]
  simulations: Simulation[]
  settings: AppSettings
  summary: PortfolioSummary
  displayMode: 'exact' | 'compact'
  onSaveSimulation: (simulation: Simulation) => Promise<void>
  onDeleteSimulation: (simulation: Simulation) => Promise<void>
}

interface ScenarioDraft {
  name: string
  collateralStockIds: string[]
  loanAmountTwd: number
  annualInterestRatePercent: number
  borrowingMonths: number
  repaymentMethod: RepaymentMethod
  targetStockId: string
  allocationPercent: number
}

interface ScenarioMetrics {
  name: string
  isBaseline: boolean
  totalAssetsTwd: number
  netWorthTwd: number
  totalLiabilitiesTwd: number
  leverageRatio: number
  maintenanceRatioPercent: number
  maintenanceStatus: MaintenanceStatus
  annualDividendTwd: number
  annualInterestTwd: number
  monthlyCashFlowTwd: number
  stress20RatioPercent: number
  stress20Status: MaintenanceStatus
  stress30RatioPercent: number
  stress30Status: MaintenanceStatus
  marginCallDropPercent: number | null
}

function finiteNonNegative(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? value as number : fallback
}

function defaultTargetStock(stocks: StockAsset[]): StockAsset | undefined {
  return stocks.find((stock) => stock.symbol === '00878') ?? stocks[0]
}

function defaultCollateralIds(stocks: StockAsset[]): string[] {
  const marked = stocks.filter((stock) => stock.asCollateral).map((stock) => stock.id)
  return marked.length > 0 ? marked : stocks.slice(0, 1).map((stock) => stock.id)
}

function baseSnapshot(summary: PortfolioSummary): SimulationSnapshot {
  return {
    stockMarketValueTwd: summary.stockMarketValueTwd,
    cashValueTwd: summary.cashValueTwd,
    totalAssetsTwd: summary.totalAssetsTwd,
    totalLiabilitiesTwd: summary.totalLiabilitiesTwd,
    netWorthTwd: summary.netWorthTwd,
    annualEstimatedDividendTwd: summary.annualEstimatedDividendTwd,
    monthlyCashFlowTwd: summary.monthlyCashFlowTwd,
    debtRatioPercent: summary.debtRatioPercent,
    leverageRatio: summary.leverageRatio,
  }
}

function createDraft(simulation: Simulation | null, stocks: StockAsset[]): ScenarioDraft {
  const savedInvestment = simulation?.investments[0]
  const savedStock = savedInvestment?.stockAssetId
    ? stocks.find((stock) => stock.id === savedInvestment.stockAssetId)
    : stocks.find((stock) => stock.symbol === savedInvestment?.symbol)
  const targetStock = savedStock ?? (simulation ? undefined : defaultTargetStock(stocks))

  return {
    name: simulation?.name ?? '00878 現金流方案',
    collateralStockIds: simulation?.collateralStockIds ?? defaultCollateralIds(stocks),
    loanAmountTwd: simulation ? finiteNonNegative(simulation.loanAmount) : 1_000_000,
    annualInterestRatePercent: simulation ? finiteNonNegative(simulation.annualInterestRatePercent) : 3,
    borrowingMonths: simulation ? Math.max(1, Math.round(finiteNonNegative(simulation.borrowingMonths, 12))) : 12,
    repaymentMethod: simulation?.repaymentMethod ?? 'interest-only',
    targetStockId: targetStock?.id ?? '',
    allocationPercent: simulation ? Math.min(100, finiteNonNegative(savedInvestment?.allocationPercent)) : 100,
  }
}

function materialiseInvestmentStock(simulation: Simulation, stocks: StockAsset[]): StockAsset | null {
  const investment = simulation.investments[0]
  if (!investment) return null
  const savedStock = investment.stockAssetId ? stocks.find((stock) => stock.id === investment.stockAssetId) : stocks.find((stock) => stock.symbol === investment.symbol)
  if (savedStock) return savedStock

  return {
    id: investment.stockAssetId ?? `saved-${simulation.id}`,
    kind: 'stock',
    symbol: investment.symbol,
    name: investment.name,
    market: 'OTHER',
    currency: 'TWD',
    exchangeRateToTwd: 1,
    shares: 0,
    averageCost: investment.price,
    currentPrice: investment.price,
    estimatedAnnualDividendPerShare: investment.annualDividendPerShare,
    estimatedYieldPercent: investment.estimatedYieldPercent,
    asCollateral: false,
    notes: '由已保存方案保留的手動試算標的。',
    createdAt: simulation.createdAt,
    updatedAt: simulation.updatedAt,
  }
}

function collateralValueForSimulation(simulation: Simulation, stocks: StockAsset[]): number {
  return calculateCollateralSelectionsValueTwd(simulation.collateralStockIds.map((stockAssetId) => {
    const stock = stocks.find((item) => item.id === stockAssetId)
    return { stockAssetId, pledgedShares: stock?.shares ?? 0 }
  }), stocks)
}

function compareSimulation(simulation: Simulation, stocks: StockAsset[], summary: PortfolioSummary, settings: AppSettings): ScenarioComparisonResult {
  return calculateScenarioComparison({
    base: baseSnapshot(summary),
    loanAmountTwd: simulation.loanAmount,
    annualInterestRatePercent: simulation.annualInterestRatePercent,
    targetStock: materialiseInvestmentStock(simulation, stocks),
    investmentAllocationPercent: simulation.investments[0]?.allocationPercent ?? 0,
    collateralValueTwd: collateralValueForSimulation(simulation, stocks),
    warningRatioPercent: settings.maintenanceWarningRatioPercent,
    marginCallRatioPercent: settings.maintenanceMarginCallRatioPercent,
  })
}

function buildSimulation(draft: ScenarioDraft, stocks: StockAsset[], existing: Simulation | null): Simulation {
  const time = new Date().toISOString()
  const targetStock = stocks.find((stock) => stock.id === draft.targetStockId)
  const amount = finiteNonNegative(draft.loanAmountTwd) * Math.min(100, finiteNonNegative(draft.allocationPercent)) / 100
  const previousInvestment = existing?.investments[0]
  const investment: SimulationInvestment | null = targetStock ? {
    id: previousInvestment?.id ?? createId('scenario-investment'),
    stockAssetId: targetStock.id,
    symbol: targetStock.symbol,
    name: targetStock.name,
    price: targetStock.currentPrice,
    amount,
    allocationPercent: Math.min(100, finiteNonNegative(draft.allocationPercent)),
    estimatedYieldPercent: targetStock.estimatedYieldPercent,
    annualDividendPerShare: targetStock.estimatedAnnualDividendPerShare,
  } : null

  return {
    id: existing?.id ?? createId('simulation'),
    name: draft.name.trim() || '未命名模擬方案',
    collateralStockIds: [...draft.collateralStockIds],
    loanAmount: finiteNonNegative(draft.loanAmountTwd),
    annualInterestRatePercent: finiteNonNegative(draft.annualInterestRatePercent),
    borrowingMonths: Math.max(1, Math.round(finiteNonNegative(draft.borrowingMonths, 12))),
    repaymentMethod: draft.repaymentMethod,
    investments: investment ? [investment] : [],
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  }
}

function metricsFromResult(name: string, result: ScenarioComparisonResult, isBaseline = false): ScenarioMetrics {
  return {
    name,
    isBaseline,
    totalAssetsTwd: result.simulation.after.totalAssetsTwd,
    netWorthTwd: result.simulation.after.netWorthTwd,
    totalLiabilitiesTwd: result.simulation.after.totalLiabilitiesTwd,
    leverageRatio: result.simulation.after.leverageRatio,
    maintenanceRatioPercent: result.simulation.maintenanceRatioPercent,
    maintenanceStatus: result.simulation.maintenanceStatus,
    annualDividendTwd: result.simulation.after.annualEstimatedDividendTwd,
    annualInterestTwd: result.simulation.annualInterestTwd,
    monthlyCashFlowTwd: result.simulation.after.monthlyCashFlowTwd,
    stress20RatioPercent: result.stress20Maintenance.ratioPercent,
    stress20Status: result.stress20Maintenance.status,
    stress30RatioPercent: result.stress30Maintenance.ratioPercent,
    stress30Status: result.stress30Maintenance.status,
    marginCallDropPercent: result.marginCallDropPercent,
  }
}

function statusClass(status: MaintenanceStatus): string {
  return `status-${status}`
}

function ratioLabel(ratioPercent: number): string {
  return ratioPercent === Number.POSITIVE_INFINITY ? '—' : formatPercent(ratioPercent)
}

function statusLabel(status: MaintenanceStatus): string {
  if (status === 'safe') return '安全'
  if (status === 'warning') return '警戒'
  if (status === 'danger') return '追繳風險'
  return '尚無法判讀'
}

function dropLabel(dropPercent: number | null): string {
  if (dropPercent === null) return '—'
  return dropPercent <= 0 ? '已碰線' : `-${formatPercent(dropPercent, 0)}`
}

function formatScenarioAmount(value: number, displayMode: 'exact' | 'compact'): string {
  return value === 0 ? formatTwd(0, displayMode) : formatCurrencyWithSign(value, displayMode)
}

function ScenarioMetricChart({ title, caption, rows, value, formatValue, tone = 'teal' }: { title: string; caption: string; rows: ScenarioMetrics[]; value: (row: ScenarioMetrics) => number; formatValue: (value: number) => string; tone?: 'teal' | 'positive' }) {
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(value(row))))
  return <section className="scenario-chart-card"><div className="scenario-chart-heading"><div><div className="section-kicker">{caption}</div><h3>{title}</h3></div><BarChart3 size={17} /></div><div className="scenario-chart-list">{rows.map((row) => { const metric = value(row); return <div className="scenario-chart-row" key={row.name}><div className="scenario-chart-label"><strong>{row.name}</strong><span>{formatValue(metric)}</span></div><div className="scenario-chart-track"><span className={`scenario-chart-bar scenario-chart-bar-${tone} ${metric < 0 ? 'is-negative' : ''}`} style={{ width: `${Math.max(2, Math.min(100, Math.abs(metric) / maximum * 100))}%` }} /></div></div> })}</div></section>
}

export function ScenarioComparison({ stocks, simulations, settings, summary, displayMode, onSaveSimulation, onDeleteSimulation }: ScenarioComparisonProps) {
  const [editingSimulation, setEditingSimulation] = useState<Simulation | null>(null)
  const [draft, setDraft] = useState<ScenarioDraft>(() => createDraft(null, stocks))

  const previewSimulation = useMemo(() => buildSimulation(draft, stocks, editingSimulation), [draft, editingSimulation, stocks])
  const previewResult = useMemo(() => compareSimulation(previewSimulation, stocks, summary, settings), [previewSimulation, settings, stocks, summary])
  const baselineResult = useMemo(() => calculateScenarioComparison({
    base: baseSnapshot(summary),
    loanAmountTwd: 0,
    annualInterestRatePercent: 0,
    targetStock: null,
    investmentAllocationPercent: 0,
    collateralValueTwd: summary.collateralValueTwd,
    warningRatioPercent: settings.maintenanceWarningRatioPercent,
    marginCallRatioPercent: settings.maintenanceMarginCallRatioPercent,
  }), [settings.maintenanceMarginCallRatioPercent, settings.maintenanceWarningRatioPercent, summary])
  const savedResults = useMemo(() => simulations.map((simulation) => ({ simulation, result: compareSimulation(simulation, stocks, summary, settings) })), [settings, simulations, stocks, summary])
  const baselineMetrics: ScenarioMetrics = {
    name: '目前基準線',
    isBaseline: true,
    totalAssetsTwd: summary.totalAssetsTwd,
    netWorthTwd: summary.netWorthTwd,
    totalLiabilitiesTwd: summary.totalLiabilitiesTwd,
    leverageRatio: summary.leverageRatio,
    maintenanceRatioPercent: summary.maintenanceRatioPercent,
    maintenanceStatus: summary.maintenanceStatus,
    annualDividendTwd: summary.annualEstimatedDividendTwd,
    annualInterestTwd: summary.monthlyLoanInterestTwd * 12,
    monthlyCashFlowTwd: summary.monthlyCashFlowTwd,
    stress20RatioPercent: baselineResult.stress20Maintenance.ratioPercent,
    stress20Status: baselineResult.stress20Maintenance.status,
    stress30RatioPercent: baselineResult.stress30Maintenance.ratioPercent,
    stress30Status: baselineResult.stress30Maintenance.status,
    marginCallDropPercent: baselineResult.marginCallDropPercent,
  }
  const comparisonRows = useMemo(() => [
    baselineMetrics,
    ...savedResults.map(({ simulation, result }) => metricsFromResult(simulation.name, result)),
  ], [baselineMetrics, savedResults])
  const previewMetrics = metricsFromResult(previewSimulation.name, previewResult)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSaveSimulation(buildSimulation(draft, stocks, editingSimulation))
    setEditingSimulation(null)
  }

  const handleApply = (simulation: Simulation) => {
    setEditingSimulation(simulation)
    setDraft(createDraft(simulation, stocks))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (simulation: Simulation) => {
    const time = new Date().toISOString()
    void onSaveSimulation({ ...simulation, id: createId('simulation'), name: `${simulation.name}・副本`, investments: simulation.investments.map((investment) => ({ ...investment, id: createId('scenario-investment') })), createdAt: time, updatedAt: time })
  }

  const handleDelete = (simulation: Simulation) => {
    if (!window.confirm(`確定要刪除「${simulation.name}」嗎？`)) return
    if (editingSimulation?.id === simulation.id) setEditingSimulation(null)
    void onDeleteSimulation(simulation)
  }

  const resetDraft = () => {
    setEditingSimulation(null)
    setDraft(createDraft(null, stocks))
  }

  const toggleCollateral = (stockId: string) => setDraft((current) => ({
    ...current,
    collateralStockIds: current.collateralStockIds.includes(stockId)
      ? current.collateralStockIds.filter((id) => id !== stockId)
      : [...current.collateralStockIds, stockId],
  }))

  return (
    <div className="scenario-v07">
      <section className="scenario-intro-card card">
        <div><div className="section-kicker">多情境比較 / V0.7</div><h2>不要只看一個答案，<span>把方案放在同一張表。</span></h2><p>把不同借款金額、投入標的與擔保品配置保存下來；基準資料更新後，方案會重新計算資產、現金流與壓力後維持率。</p></div>
        <span className="scenario-local-pill"><ShieldCheck size={15} />只保存設定，不保存快照</span>
      </section>

      <div className="scenario-builder-layout">
        <form className="card scenario-builder-card" onSubmit={(event) => void handleSubmit(event)}>
          <div className="section-heading-row scenario-section-heading"><div><div className="section-kicker">方案設定</div><h2>{editingSimulation ? '調整這個方案' : '先建立一個可比較的方案。'}</h2></div><Target size={19} className="scenario-icon" /></div>
          <div className="scenario-control-group"><label className="form-field"><span>方案名稱</span><input required value={draft.name} placeholder="例如 00878 現金流方案" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label></div>
          <div className="scenario-control-group"><div className="scenario-control-label"><span>借款假設</span><small>這些只用於方案試算，不會建立實際借款</small></div><div className="form-grid form-grid-two scenario-form-grid"><label className="form-field"><span>質押借款<small>NTD</small></span><input min="0" step="10000" type="number" value={draft.loanAmountTwd || ''} placeholder="1,000,000" onChange={(event) => setDraft((current) => ({ ...current, loanAmountTwd: Number(event.target.value) }))} /></label><label className="form-field"><span>年利率<small>百分比</small></span><div className="input-with-suffix"><input min="0" step="0.1" type="number" value={draft.annualInterestRatePercent || ''} placeholder="3" onChange={(event) => setDraft((current) => ({ ...current, annualInterestRatePercent: Number(event.target.value) }))} /><em>%</em></div></label><label className="form-field"><span>借款期間<small>月</small></span><input min="1" step="1" type="number" value={draft.borrowingMonths} onChange={(event) => setDraft((current) => ({ ...current, borrowingMonths: Number(event.target.value) }))} /></label><label className="form-field"><span>還款方式</span><div className="select-wrap"><select value={draft.repaymentMethod} onChange={(event) => setDraft((current) => ({ ...current, repaymentMethod: event.target.value as RepaymentMethod }))}><option value="interest-only">只繳利息</option><option value="equal-principal">本金平均攤還</option><option value="amortized">本息平均攤還</option></select><ChevronDown className="select-chevron" size={16} aria-hidden="true" /></div></label></div></div>
          <div className="scenario-control-group"><div className="scenario-control-label"><span>投入標的</span><small>借款投入比例與股票目前手動價格</small></div><div className="form-grid form-grid-two scenario-form-grid"><label className="form-field"><span>股票／ETF</span><div className="select-wrap"><select value={draft.targetStockId} onChange={(event) => setDraft((current) => ({ ...current, targetStockId: event.target.value }))}><option value="">不投入，保留現金</option>{stocks.map((stock) => <option value={stock.id} key={stock.id}>{stock.symbol} · {stock.name}</option>)}</select><ChevronDown className="select-chevron" size={16} aria-hidden="true" /></div></label><label className="form-field"><span>投入比例<small>借款金額</small></span><div className="input-with-suffix"><input min="0" max="100" step="5" type="number" value={draft.allocationPercent} onChange={(event) => setDraft((current) => ({ ...current, allocationPercent: Math.min(100, Math.max(0, Number(event.target.value))) }))} /><em>%</em></div></label></div>{draft.targetStockId && <div className="scenario-selected-stock">{(() => { const stock = stocks.find((item) => item.id === draft.targetStockId); return stock ? <><span className="scenario-stock-badge">{stock.symbol.slice(0, 2)}</span><div><strong>{stock.symbol} · {stock.name}</strong><small>現價 {formatTwd(stock.currentPrice * (stock.exchangeRateToTwd || 1), displayMode)} · 年配息 {formatNumber(stock.estimatedAnnualDividendPerShare, 2)} 元／股</small></div><Check size={16} /></> : null })()}</div>}</div>
          <div className="scenario-control-group"><div className="scenario-control-label"><span>擔保品股票</span><small>以整筆持股市值估算方案維持率</small></div><div className="scenario-collateral-list">{stocks.length > 0 ? stocks.map((stock) => <label className={`scenario-collateral-option ${draft.collateralStockIds.includes(stock.id) ? 'is-selected' : ''}`} key={stock.id}><input type="checkbox" checked={draft.collateralStockIds.includes(stock.id)} onChange={() => toggleCollateral(stock.id)} /><span className="custom-checkbox"><Check size={13} /></span><span><strong>{stock.symbol} · {stock.name}</strong><small>{formatTwd(calculateStockMarketValue(stock), displayMode)} · {formatNumber(stock.shares)} 股</small></span></label>) : <div className="inline-empty">先到資產管理新增股票，才能設定方案擔保品。</div>}</div></div>
          <div className="scenario-actions"><button type="submit" className="button button-primary"><Check size={15} />{editingSimulation ? '更新方案' : '保存方案'}</button>{editingSimulation && <button type="button" className="button button-ghost" onClick={resetDraft}><Plus size={15} />新增另一個方案</button>}</div>
          <div className="scenario-note"><Info size={15} /><span>保存的是借款與投資假設，不會寫入實際 Loan，也不會改動你的股票、現金或擔保品資料。</span></div>
        </form>

        <section className={`card scenario-preview-card ${statusClass(previewMetrics.maintenanceStatus)}`}>
          <div className="section-heading-row scenario-section-heading"><div><div className="section-kicker">即時預覽</div><h2>這個方案，值得比較嗎？</h2></div><span className={`risk-badge ${statusClass(previewMetrics.maintenanceStatus)}`}>{statusLabel(previewMetrics.maintenanceStatus)}</span></div>
          <div className="scenario-preview-main"><span>模擬後每月淨現金流</span><strong className={previewMetrics.monthlyCashFlowTwd >= 0 ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(previewMetrics.monthlyCashFlowTwd, displayMode)}</strong><small>目前基準線 {formatCurrencyWithSign(summary.monthlyCashFlowTwd, displayMode)}；新增股息 − 新增利息</small></div>
          <div className="scenario-preview-grid"><div><span>模擬後總資產</span><strong>{formatTwd(previewMetrics.totalAssetsTwd, displayMode)}</strong></div><div><span>模擬後淨資產</span><strong>{formatTwd(previewMetrics.netWorthTwd, displayMode)}</strong></div><div><span>總負債</span><strong>{formatTwd(previewMetrics.totalLiabilitiesTwd, displayMode)}</strong></div><div><span>槓桿倍數</span><strong>{Number.isFinite(previewMetrics.leverageRatio) ? `${previewMetrics.leverageRatio.toFixed(2)}x` : '∞'}</strong></div><div><span>新增年度股息</span><strong className="positive-text">{formatTwd(previewResult.simulation.annualDividendTwd, displayMode)}</strong></div><div><span>新增年度利息</span><strong className="negative-text">{formatTwd(previewResult.simulation.annualInterestTwd, displayMode)}</strong></div></div>
          <div className="scenario-stress-strip"><div><span>-20% 維持率</span><strong className={statusClass(previewMetrics.stress20Status)}>{ratioLabel(previewMetrics.stress20RatioPercent)}</strong></div><div><span>-30% 維持率</span><strong className={statusClass(previewMetrics.stress30Status)}>{ratioLabel(previewMetrics.stress30RatioPercent)}</strong></div><div><span>跌到追繳線</span><strong className="negative-text">{dropLabel(previewMetrics.marginCallDropPercent)}</strong></div></div>
          <div className="scenario-preview-note"><TrendingDown size={15} /><span>壓力測試假設股票與擔保品同步下跌，現金與借款餘額不變。</span></div>
        </section>
      </div>

      <section className="card scenario-table-card"><div className="section-heading-row scenario-table-heading"><div><div className="section-kicker">比較表</div><h2>把基準線與保存方案放在一起。</h2></div><span className="section-caption">{comparisonRows.length} 個情境</span></div><div className="table-wrap"><table className="data-table scenario-table"><thead><tr><th>方案</th><th>總資產</th><th>淨資產</th><th>負債</th><th>槓桿</th><th>月淨現金流</th><th>年股息</th><th>維持率</th><th>-20%</th><th>-30%</th><th>距追繳跌幅</th></tr></thead><tbody>{comparisonRows.map((row) => <tr key={row.name} className={row.isBaseline ? 'is-baseline' : ''}><td data-label="方案"><strong>{row.name}</strong>{row.isBaseline && <span className="scenario-baseline-badge">目前</span>}</td><td data-label="總資產">{formatTwd(row.totalAssetsTwd, displayMode)}</td><td data-label="淨資產"><strong>{formatTwd(row.netWorthTwd, displayMode)}</strong></td><td data-label="負債">{formatTwd(row.totalLiabilitiesTwd, displayMode)}</td><td data-label="槓桿">{Number.isFinite(row.leverageRatio) ? `${row.leverageRatio.toFixed(2)}x` : '∞'}</td><td data-label="月淨現金流" className={row.monthlyCashFlowTwd >= 0 ? 'positive-text' : 'negative-text'}>{formatScenarioAmount(row.monthlyCashFlowTwd, displayMode)}</td><td data-label="年股息" className="positive-text">{formatTwd(row.annualDividendTwd, displayMode)}</td><td data-label="維持率"><span className={`status-text ${statusClass(row.maintenanceStatus)}`}>{ratioLabel(row.maintenanceRatioPercent)}</span></td><td data-label="-20%"><span className={`status-text ${statusClass(row.stress20Status)}`}>{ratioLabel(row.stress20RatioPercent)}</span></td><td data-label="-30%"><span className={`status-text ${statusClass(row.stress30Status)}`}>{ratioLabel(row.stress30RatioPercent)}</span></td><td data-label="距追繳跌幅" className="negative-text">{dropLabel(row.marginCallDropPercent)}</td></tr>)}</tbody></table></div></section>

      <section className="scenario-chart-grid"><ScenarioMetricChart title="年度股息比較" caption="收入能力" rows={comparisonRows} value={(row) => row.annualDividendTwd} formatValue={(value) => formatTwd(value, displayMode)} tone="positive" /><ScenarioMetricChart title="每月淨現金流比較" caption="現金流能力" rows={comparisonRows} value={(row) => row.monthlyCashFlowTwd} formatValue={(value) => formatScenarioAmount(value, displayMode)} /><ScenarioMetricChart title="-20% 維持率比較" caption="風控距離" rows={comparisonRows} value={(row) => Number.isFinite(row.stress20RatioPercent) ? row.stress20RatioPercent : 0} formatValue={(value) => Number.isFinite(value) && value > 0 ? ratioLabel(value) : '—'} /></section>

      {simulations.length > 0 && <section className="card scenario-saved-card"><div className="section-heading-row"><div><div className="section-kicker">本機已保存</div><h2>方案清單</h2></div><span className="section-caption">可套用、複製或刪除</span></div><div className="scenario-saved-list">{simulations.map((simulation) => { const result = compareSimulation(simulation, stocks, summary, settings); return <article className="scenario-saved-row" key={simulation.id}><div className="scenario-saved-main"><span className="scenario-saved-icon"><Target size={16} /></span><div><strong>{simulation.name}</strong><small>{simulation.investments[0]?.symbol ?? '不投入股票'} · 借款 {formatTwd(simulation.loanAmount, displayMode)} · {simulation.annualInterestRatePercent}%</small></div></div><div className="scenario-saved-metric"><span>投入比例</span><strong>{formatPercent(simulation.investments[0]?.allocationPercent ?? 0, 0)}</strong></div><div className="scenario-saved-metric"><span>壓力後 -20%</span><strong className={statusClass(result.stress20Maintenance.status)}>{ratioLabel(result.stress20Maintenance.ratioPercent)}</strong></div><div className="scenario-saved-actions"><button type="button" className="button button-ghost" onClick={() => handleApply(simulation)}><Edit3 size={14} />套用</button><button type="button" className="icon-button small" aria-label={`複製 ${simulation.name}`} onClick={() => handleCopy(simulation)}><Copy size={15} /></button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${simulation.name}`} onClick={() => handleDelete(simulation)}><Trash2 size={15} /></button></div></article> })}</div></section>}

      <div className="formula-note"><span className="formula-note-mark">Σ</span><span><strong>本頁計算原則：</strong>方案只保存借款與投資假設；比較時重新套用目前資產基準，借款會同時增加資產與負債，淨資產不會因借款本身增加。</span></div>
    </div>
  )
}
