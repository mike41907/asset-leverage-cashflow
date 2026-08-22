import { useMemo, useState, type FormEvent } from 'react'
import { BarChart3, Check, ChevronDown, CircleDollarSign, Edit3, Plus, ShieldCheck, Target, Trash2 } from 'lucide-react'
import type { DividendIncomeMode, DividendTarget, StockAsset } from '../domain/models'
import { calculateDividendTarget, calculatePerShareDividendTarget, type PortfolioSummary } from '../domain/calculations'
import { formatCurrencyWithSign, formatNumber, formatPercent, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'

interface PassiveIncomeTargetProps {
  stocks: StockAsset[]
  summary: PortfolioSummary
  targets: DividendTarget[]
  displayMode: 'exact' | 'compact'
  onSaveTarget: (target: DividendTarget) => Promise<void>
  onDeleteTarget: (target: DividendTarget) => Promise<void>
}

type TargetCalculationMode = 'yield' | 'per-share'
type QuarterlyDividends = [number, number, number, number]

interface TargetDraft {
  name: string
  monthlyTargetTwd: number
  incomeMode: DividendIncomeMode
  monthlyDebtCostTwd: number
  mode: TargetCalculationMode
  stockAssetId: string
  symbol: string
  assetName: string
  annualYieldPercent: number
  quarterlyDividends: QuarterlyDividends
  currentPriceTwd: number
}

const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4']

function positive(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value as number : fallback
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value as number : 0
}

function stockPriceTwd(stock: StockAsset | undefined): number {
  return stock ? positive(stock.currentPrice) * positive(stock.exchangeRateToTwd || 1, 1) : 0
}

function quarterlyFromAnnual(annualDividendPerShare: number): QuarterlyDividends {
  const quarter = nonNegative(annualDividendPerShare) / 4
  return [quarter, quarter, quarter, quarter]
}

function quarterlyFromValues(values: readonly number[] | undefined, fallbackAnnual: number): QuarterlyDividends {
  const fallback = quarterlyFromAnnual(fallbackAnnual)
  return [0, 1, 2, 3].map((index) => nonNegative(values?.[index] ?? fallback[index])) as QuarterlyDividends
}

function defaultStock(stocks: StockAsset[]): StockAsset | undefined {
  return stocks.find((stock) => stock.symbol === '00878') ?? stocks[0]
}

function createDraft(target: DividendTarget | null, stocks: StockAsset[], summary: PortfolioSummary): TargetDraft {
  const stock = target?.stockAssetId
    ? stocks.find((item) => item.id === target.stockAssetId)
    : target ? undefined : defaultStock(stocks)
  const targetMode = target?.mode ?? 'yield'
  const annualDividendPerShare = target?.annualDividendPerShare ?? stock?.estimatedAnnualDividendPerShare ?? 0

  return {
    name: target?.name ?? '我的被動收入目標',
    monthlyTargetTwd: target ? nonNegative(target.monthlyNetTarget) : 40_000,
    incomeMode: target?.incomeMode ?? 'net',
    monthlyDebtCostTwd: target ? nonNegative(target.monthlyDebtCost) : summary.monthlyDebtServiceTwd,
    mode: targetMode,
    stockAssetId: stock?.id ?? '',
    symbol: target?.symbol ?? stock?.symbol ?? '',
    assetName: target?.assetName ?? stock?.name ?? '',
    annualYieldPercent: positive(target?.annualYieldPercent, positive(stock?.estimatedYieldPercent, 7)),
    quarterlyDividends: quarterlyFromValues(target?.quarterlyDividends, annualDividendPerShare),
    currentPriceTwd: positive(target?.currentPrice, stockPriceTwd(stock)),
  }
}

function targetModeLabel(mode: TargetCalculationMode): string {
  return mode === 'yield' ? '殖利率模式' : '每股配息模式'
}

function incomeModeLabel(mode: DividendIncomeMode): string {
  return mode === 'net' ? '淨領目標' : '毛收入'
}

function targetFromDraft(draft: TargetDraft, existing: DividendTarget | null, annualDividendPerShare: number): DividendTarget {
  const time = new Date().toISOString()
  return {
    id: existing?.id ?? createId('target'),
    name: draft.name.trim() || '未命名被動收入目標',
    monthlyNetTarget: nonNegative(draft.monthlyTargetTwd),
    monthlyDebtCost: draft.incomeMode === 'net' ? nonNegative(draft.monthlyDebtCostTwd) : 0,
    incomeMode: draft.incomeMode,
    mode: draft.mode,
    stockAssetId: draft.stockAssetId || null,
    symbol: draft.symbol.trim().toUpperCase(),
    assetName: draft.assetName.trim(),
    annualYieldPercent: nonNegative(draft.annualYieldPercent),
    annualDividendPerShare,
    quarterlyDividends: draft.quarterlyDividends.map(nonNegative),
    currentPrice: nonNegative(draft.currentPriceTwd),
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  }
}

function requiredPrincipalForTarget(target: DividendTarget): number | null {
  const incomeMode = target.incomeMode ?? 'net'
  const monthlyDebtCost = incomeMode === 'net' ? nonNegative(target.monthlyDebtCost) : 0
  if (target.mode === 'per-share') {
    return calculatePerShareDividendTarget(
      calculateDividendTarget(target.monthlyNetTarget, target.annualYieldPercent, monthlyDebtCost).annualTargetTwd,
      quarterlyFromValues(target.quarterlyDividends, target.annualDividendPerShare),
      target.currentPrice,
    ).requiredPrincipalTwd
  }

  return calculateDividendTarget(target.monthlyNetTarget, target.annualYieldPercent, monthlyDebtCost).requiredPrincipalTwd
}

export function PassiveIncomeTarget({ stocks, summary, targets, displayMode, onSaveTarget, onDeleteTarget }: PassiveIncomeTargetProps) {
  const [editingTarget, setEditingTarget] = useState<DividendTarget | null>(null)
  const [draft, setDraft] = useState<TargetDraft>(() => createDraft(null, stocks, summary))

  const selectedStock = stocks.find((stock) => stock.id === draft.stockAssetId)
  const targetCalculation = useMemo(() => calculateDividendTarget(
    draft.monthlyTargetTwd,
    draft.annualYieldPercent,
    draft.incomeMode === 'net' ? draft.monthlyDebtCostTwd : 0,
  ), [draft.monthlyDebtCostTwd, draft.monthlyTargetTwd, draft.annualYieldPercent, draft.incomeMode])
  const perShareCalculation = useMemo(() => calculatePerShareDividendTarget(
    targetCalculation.annualTargetTwd,
    draft.quarterlyDividends,
    draft.currentPriceTwd,
  ), [draft.currentPriceTwd, draft.quarterlyDividends, targetCalculation.annualTargetTwd])
  const requiredPrincipal = draft.mode === 'yield' ? targetCalculation.requiredPrincipalTwd : perShareCalculation.requiredPrincipalTwd
  const currentComparableMonthlyIncome = draft.incomeMode === 'net'
    ? summary.monthlyEstimatedDividendTwd - nonNegative(draft.monthlyDebtCostTwd)
    : summary.monthlyEstimatedDividendTwd
  const progressPercent = draft.monthlyTargetTwd > 0
    ? Math.min(100, Math.max(0, currentComparableMonthlyIncome / draft.monthlyTargetTwd * 100))
    : 0
  const incomeGap = currentComparableMonthlyIncome - nonNegative(draft.monthlyTargetTwd)

  const selectStock = (stockAssetId: string) => {
    const stock = stocks.find((item) => item.id === stockAssetId)
    if (!stock) {
      setDraft((current) => ({ ...current, stockAssetId: '', symbol: '', assetName: '', currentPriceTwd: 0 }))
      return
    }

    const annualDividendPerShare = nonNegative(stock.estimatedAnnualDividendPerShare)
    setDraft((current) => ({
      ...current,
      stockAssetId: stock.id,
      symbol: stock.symbol,
      assetName: stock.name,
      annualYieldPercent: positive(stock.estimatedYieldPercent, current.annualYieldPercent || 7),
      quarterlyDividends: quarterlyFromAnnual(annualDividendPerShare),
      currentPriceTwd: stockPriceTwd(stock),
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = targetFromDraft(draft, editingTarget, perShareCalculation.annualDividendPerShareTwd)
    await onSaveTarget(target)
    setEditingTarget(null)
  }

  const handleApply = (target: DividendTarget) => {
    setEditingTarget(target)
    setDraft(createDraft(target, stocks, summary))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (target: DividendTarget) => {
    if (!window.confirm(`確定要刪除「${target.name}」嗎？`)) return
    if (editingTarget?.id === target.id) setEditingTarget(null)
    void onDeleteTarget(target)
  }

  const resetDraft = () => {
    setEditingTarget(null)
    setDraft(createDraft(null, stocks, summary))
  }

  return (
    <div className="passive-target-v06">
      <section className="card passive-target-intro-card">
        <div><div className="section-kicker">被動收入目標 / V0.6</div><h2>設定目標，反推所需資產。</h2></div>
        <span className="passive-target-local-pill"><ShieldCheck size={15} />只在本機試算</span>
      </section>

      <form className="passive-target-layout" onSubmit={(event) => void handleSubmit(event)}>
        <section className="card passive-target-controls-card">
          <div className="section-heading-row passive-target-section-heading"><div><div className="section-kicker">目標設定</div><h2>每月目標</h2></div><Target size={19} className="passive-target-icon" /></div>

          <div className="passive-target-control-group">
            <div className="passive-target-control-label"><span>收入目標</span><small>每月金額</small></div>
            <div className="form-grid form-grid-two passive-target-form-grid">
              <label className="form-field"><span>目標名稱</span><input required value={draft.name} placeholder="例如 退休被動收入" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="form-field"><span>每月目標<small>NTD</small></span><input required min="0" step="1000" type="number" value={draft.monthlyTargetTwd || ''} placeholder="40,000" onChange={(event) => setDraft((current) => ({ ...current, monthlyTargetTwd: Number(event.target.value) }))} /></label>
            </div>
            <div className="passive-target-segmented" role="radiogroup" aria-label="收入目標類型">
              <button type="button" role="radio" aria-checked={draft.incomeMode === 'gross'} className={draft.incomeMode === 'gross' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, incomeMode: 'gross' }))}><CircleDollarSign size={15} />毛收入</button>
              <button type="button" role="radio" aria-checked={draft.incomeMode === 'net'} className={draft.incomeMode === 'net' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, incomeMode: 'net' }))}><ShieldCheck size={15} />淨領目標</button>
            </div>
            {draft.incomeMode === 'net' && <label className="form-field passive-target-debt-field"><span>每月借款成本<small>利息＋本金，可調整</small></span><input min="0" step="100" type="number" value={draft.monthlyDebtCostTwd || ''} placeholder="0" onChange={(event) => setDraft((current) => ({ ...current, monthlyDebtCostTwd: Number(event.target.value) }))} /></label>}
          </div>

          <div className="passive-target-control-group">
            <div className="passive-target-control-label"><span>計算標的</span></div>
            {stocks.length > 0 && <label className="form-field"><span>股票／ETF</span><div className="select-wrap"><select value={draft.stockAssetId} onChange={(event) => selectStock(event.target.value)}><option value="">自訂股票／ETF</option>{stocks.map((stock) => <option value={stock.id} key={stock.id}>{stock.symbol} · {stock.name}</option>)}</select><ChevronDown className="select-chevron" size={16} aria-hidden="true" /></div></label>}
            {draft.stockAssetId && selectedStock ? <div className="passive-target-selected-asset"><span className="passive-target-asset-badge">{selectedStock.symbol.slice(0, 2)}</span><div><strong>{selectedStock.symbol} · {selectedStock.name}</strong><small>目前現價 {formatTwd(stockPriceTwd(selectedStock), displayMode)} · 預估殖利率 {formatPercent(selectedStock.estimatedYieldPercent)}</small></div><Check size={16} /></div> : <div className="form-grid form-grid-two passive-target-form-grid"><label className="form-field"><span>股票代號</span><input value={draft.symbol} placeholder="例如 00878" onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} /></label><label className="form-field"><span>股票名稱</span><input value={draft.assetName} placeholder="例如 高股息 ETF" onChange={(event) => setDraft((current) => ({ ...current, assetName: event.target.value }))} /></label></div>}
          </div>

          <div className="passive-target-control-group">
            <div className="passive-target-control-label"><span>估算方式</span></div>
            <div className="passive-target-segmented" role="radiogroup" aria-label="股息估算方式">
              <button type="button" role="radio" aria-checked={draft.mode === 'yield'} className={draft.mode === 'yield' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, mode: 'yield' }))}><BarChart3 size={15} />殖利率模式</button>
              <button type="button" role="radio" aria-checked={draft.mode === 'per-share'} className={draft.mode === 'per-share' ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, mode: 'per-share' }))}><CircleDollarSign size={15} />每股配息模式</button>
            </div>
            {draft.mode === 'yield' ? <label className="form-field passive-target-single-field"><span>預估年殖利率<small>百分比</small></span><div className="input-with-suffix"><input required min="0" step="0.1" type="number" value={draft.annualYieldPercent || ''} placeholder="5.5" onChange={(event) => setDraft((current) => ({ ...current, annualYieldPercent: Number(event.target.value) }))} /><em>%</em></div></label> : <>
              <div className="passive-target-quarter-grid">{quarterLabels.map((label, index) => <label className="form-field" key={label}><span>{label} 配息<small>每股</small></span><input min="0" step="0.01" type="number" value={draft.quarterlyDividends[index] || ''} placeholder="0" onChange={(event) => setDraft((current) => ({ ...current, quarterlyDividends: current.quarterlyDividends.map((value, itemIndex) => itemIndex === index ? Number(event.target.value) : value) as QuarterlyDividends }))} /></label>)}</div>
              <label className="form-field passive-target-single-field"><span>目前股價<small>換算台幣</small></span><div className="input-with-suffix"><input required min="0" step="0.01" type="number" value={draft.currentPriceTwd || ''} placeholder="22" onChange={(event) => setDraft((current) => ({ ...current, currentPriceTwd: Number(event.target.value) }))} /><em>NT$</em></div></label>
            </>}
          </div>

          <div className="passive-target-actions"><button type="submit" className="button button-primary"><Check size={15} />{editingTarget ? '更新目標' : '保存目標'}</button>{editingTarget && <button type="button" className="button button-ghost" onClick={resetDraft}><Plus size={15} />新增另一個目標</button>}</div>
        </section>

        <section className="card passive-target-result-card">
          <div className="section-heading-row passive-target-section-heading"><div><div className="section-kicker">即時試算</div><h2>試算結果</h2></div><span className="passive-target-mode-badge">{targetModeLabel(draft.mode)}</span></div>
          <div className="passive-target-main-result"><span>預估需要本金</span><strong>{requiredPrincipal !== null ? formatTwd(requiredPrincipal, displayMode) : '等待完整輸入'}</strong><small>{draft.mode === 'yield' ? `以年殖利率 ${formatPercent(draft.annualYieldPercent)} 反推` : `每股年配息 ${formatNumber(perShareCalculation.annualDividendPerShareTwd, 2)} 元 × 需要股數`}</small></div>
          <div className="passive-target-result-grid">
            <div><span>每月毛收入需求</span><strong>{formatTwd(targetCalculation.monthlyGrossTargetTwd, displayMode)}</strong><small>{draft.incomeMode === 'net' ? `淨領 ${formatTwd(draft.monthlyTargetTwd, displayMode)} ＋成本` : '等於每月目標'}</small></div>
            <div><span>年度股息目標</span><strong>{formatTwd(targetCalculation.annualTargetTwd, displayMode)}</strong><small>每月毛收入 × 12</small></div>
            <div><span>{draft.mode === 'yield' ? '估算年殖利率' : '每股年配息'}</span><strong>{draft.mode === 'yield' ? formatPercent(draft.annualYieldPercent) : `${formatNumber(perShareCalculation.annualDividendPerShareTwd, 2)} 元`}</strong><small>{draft.mode === 'yield' ? '目前假設' : 'Q1＋Q2＋Q3＋Q4'}</small></div>
            <div><span>需要股數</span><strong>{perShareCalculation.requiredShares !== null && draft.mode === 'per-share' ? formatNumber(perShareCalculation.requiredShares) : '—'}</strong><small>{draft.mode === 'per-share' ? '向上取整股' : '切換每股配息模式查看'}</small></div>
          </div>
          <div className="passive-target-current-card"><div><span>目前持倉月股息</span><strong className="positive-text">{formatTwd(summary.monthlyEstimatedDividendTwd, displayMode)}</strong></div><div><span>扣除成本後可領</span><strong className={currentComparableMonthlyIncome >= 0 ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(currentComparableMonthlyIncome, displayMode)}</strong></div><div><span>距離目標</span><strong className={incomeGap >= 0 ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(incomeGap, displayMode)}</strong></div></div>
          <div className="passive-target-progress-heading"><span>目前達成進度</span><strong>{formatPercent(progressPercent, 0)}</strong></div>
          <div className="passive-target-progress"><span style={{ width: `${progressPercent}%` }} /></div>
        </section>
      </form>

      {targets.length > 0 && <section className="card passive-target-saved-card"><div className="section-heading-row"><div><div className="section-kicker">本機已保存</div><h2>你的被動收入目標</h2></div><span className="section-caption">{targets.length} 個目標</span></div><div className="passive-target-saved-list">{targets.map((target) => <article className="passive-target-saved-row" key={target.id}><div className="passive-target-saved-main"><span className="passive-target-saved-icon"><Target size={16} /></span><div><strong>{target.name}</strong><small>{target.symbol || '自訂標的'} · {incomeModeLabel(target.incomeMode ?? 'net')} · {targetModeLabel(target.mode)}</small></div></div><div className="passive-target-saved-metric"><span>年度目標</span><strong>{formatTwd(calculateDividendTarget(target.monthlyNetTarget, target.annualYieldPercent, target.incomeMode === 'net' ? target.monthlyDebtCost : 0).annualTargetTwd, displayMode)}</strong></div><div className="passive-target-saved-metric"><span>所需本金</span><strong>{requiredPrincipalForTarget(target) !== null ? formatTwd(requiredPrincipalForTarget(target) as number, displayMode) : '—'}</strong></div><div className="passive-target-saved-actions"><button type="button" className="button button-ghost" onClick={() => handleApply(target)}><Edit3 size={14} />套用</button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${target.name}`} onClick={() => handleDelete(target)}><Trash2 size={15} /></button></div></article>)}</div></section>}
    </div>
  )
}
