import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronDown, CircleAlert, CircleDollarSign, Info, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { AppSettings, StockAsset } from '../domain/models'
import {
  calculateCollateralSelectionsValueTwd,
  calculateReinvestmentSimulation,
  type MaintenanceStatus,
  type PortfolioSummary,
  type SimulationSnapshot,
} from '../domain/calculations'
import { fetchStockQuote, type StockQuote } from '../services/quoteService'
import { formatNumber, formatPercent, formatRatio, formatTwd } from '../shared/formatters'

interface ReinvestmentSimulatorProps {
  stocks: StockAsset[]
  settings: AppSettings
  summary: PortfolioSummary
  displayMode: 'exact' | 'compact'
}

interface SimulationCollateralSelection {
  stockAssetId: string
  pledgedShares: number
}

function initialCollateralSelections(stocks: StockAsset[]): SimulationCollateralSelection[] {
  const preferred = stocks.filter((stock) => stock.asCollateral)
  const source = preferred.length > 0 ? preferred : stocks.slice(0, 1)
  return source.map((stock) => ({ stockAssetId: stock.id, pledgedShares: stock.shares }))
}

function initialTargetStockId(stocks: StockAsset[]): string {
  return stocks.find((stock) => !stock.asCollateral)?.id ?? stocks[0]?.id ?? ''
}

function statusLabel(status: MaintenanceStatus): string {
  if (status === 'safe') return '安全'
  if (status === 'warning') return '警戒'
  if (status === 'danger') return '追繳風險'
  return '尚無法判讀'
}

function statusClass(status: MaintenanceStatus): string {
  return `status-${status}`
}

function statusDescription(status: MaintenanceStatus): string {
  if (status === 'safe') return '目前擔保品相對於這筆模擬借款仍有安全距離。'
  if (status === 'warning') return '這筆模擬借款已進入警戒區，請先降低借款或增加擔保品。'
  if (status === 'danger') return '這筆模擬借款已低於追繳線，不建議直接照此方案執行。'
  return '請先輸入借款金額並選擇擔保股票，才能判讀維持率。'
}

function statusIcon(status: MaintenanceStatus) {
  return status === 'safe' ? ShieldCheck : CircleAlert
}

function maintenanceRatioLabel(ratioPercent: number, status: MaintenanceStatus): string {
  return status === 'unavailable' ? '—' : formatPercent(ratioPercent)
}

function SnapshotCard({ title, snapshot, displayMode, tone }: { title: string; snapshot: SimulationSnapshot; displayMode: 'exact' | 'compact'; tone: 'before' | 'after' }) {
  return (
    <article className={`snapshot-card snapshot-card-${tone}`}>
      <div className="snapshot-card-heading"><span className="snapshot-card-dot" /><div><div className="section-kicker">{tone === 'before' ? '目前狀態' : '模擬結果'}</div><h3>{title}</h3></div></div>
      <div className="snapshot-metrics">
        <div><span>總資產</span><strong>{formatTwd(snapshot.totalAssetsTwd, displayMode)}</strong></div>
        <div><span>總負債</span><strong>{formatTwd(snapshot.totalLiabilitiesTwd, displayMode)}</strong></div>
        <div><span>淨資產</span><strong>{formatTwd(snapshot.netWorthTwd, displayMode)}</strong></div>
        <div><span>負債比</span><strong>{formatPercent(snapshot.debtRatioPercent)}</strong></div>
        <div><span>資產槓桿</span><strong>{formatRatio(snapshot.leverageRatio)}</strong></div>
        <div><span>月淨現金流</span><strong className={snapshot.monthlyCashFlowTwd >= 0 ? 'positive-text' : 'negative-text'}>{formatTwd(snapshot.monthlyCashFlowTwd, displayMode)}</strong></div>
      </div>
    </article>
  )
}

export function ReinvestmentSimulator({ stocks, settings, summary, displayMode }: ReinvestmentSimulatorProps) {
  const maxLoanAmountTwd = Math.max(1_000_000, Math.ceil((summary.totalAssetsTwd * 2) / 100_000) * 100_000)
  const [loanAmountTwd, setLoanAmountTwd] = useState(Math.min(100_000, maxLoanAmountTwd))
  const [annualInterestRatePercent, setAnnualInterestRatePercent] = useState(3)
  const [borrowingMonths, setBorrowingMonths] = useState(12)
  const [repaymentMethod, setRepaymentMethod] = useState<'interest-only' | 'equal-principal' | 'amortized'>('interest-only')
  const [investmentAllocationPercent, setInvestmentAllocationPercent] = useState(100)
  const [targetStockId, setTargetStockId] = useState(initialTargetStockId(stocks))
  const [collateralSelections, setCollateralSelections] = useState<SimulationCollateralSelection[]>(() => initialCollateralSelections(stocks))
  const [targetQuote, setTargetQuote] = useState<StockQuote | null>(null)
  const [targetQuoteStatus, setTargetQuoteStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [targetQuoteMessage, setTargetQuoteMessage] = useState('')
  const [yieldOverridePercent, setYieldOverridePercent] = useState<number | null>(null)

  const targetStock = stocks.find((stock) => stock.id === targetStockId) ?? null
  useEffect(() => {
    setTargetQuote(null)
    setTargetQuoteStatus('idle')
    setTargetQuoteMessage('')
    setYieldOverridePercent(null)
    if (!targetStock || targetStock.estimatedAnnualDividendPerShare > 0 || targetStock.estimatedYieldPercent > 0) return

    let active = true
    setTargetQuoteStatus('loading')
    setTargetQuoteMessage(`正在查詢 ${targetStock.symbol} 的最新行情與配息…`)
    void fetchStockQuote(targetStock.symbol, targetStock.market)
      .then((quote) => {
        if (!active) return
        setTargetQuote(quote)
        setTargetQuoteStatus('success')
        setTargetQuoteMessage(quote.dividend ? `已帶入 ${quote.dividend.period === 'trailing-12-months' ? '近 12 個月' : '前一完整年度'}配息。` : '行情已更新，但公開資料沒有配息事件；請輸入你的殖利率假設。')
      })
      .catch((error) => {
        if (!active) return
        setTargetQuoteStatus('error')
        setTargetQuoteMessage(error instanceof Error ? error.message : '配息查詢失敗，請改用手動殖利率假設。')
      })

    return () => {
      active = false
    }
  }, [targetStock?.estimatedAnnualDividendPerShare, targetStock?.estimatedYieldPercent, targetStock?.id, targetStock?.market, targetStock?.symbol])

  const quotedTargetStock = useMemo<StockAsset | null>(() => {
    if (!targetStock || !targetQuote) return targetStock
    const annualDividendPerShare = targetQuote.dividend?.annualDividendPerShare ?? targetStock.estimatedAnnualDividendPerShare
    const estimatedYieldPercent = targetQuote.dividend && targetQuote.price > 0
      ? targetQuote.dividend.annualDividendPerShare / targetQuote.price * 100
      : targetStock.estimatedYieldPercent
    return {
      ...targetStock,
      name: targetQuote.name || targetStock.name,
      currentPrice: targetQuote.price,
      currentPriceSource: 'yahoo-public',
      currentPriceFetchedAt: targetQuote.fetchedAt,
      currentPriceMarketAt: targetQuote.marketAt ?? undefined,
      currency: targetQuote.currency,
      exchangeRateToTwd: targetQuote.currency === 'TWD' ? 1 : targetStock.exchangeRateToTwd,
      estimatedAnnualDividendPerShare: annualDividendPerShare,
      estimatedYieldPercent,
      dividendSource: targetQuote.dividend ? 'yahoo-public' : targetStock.dividendSource,
      dividendFetchedAt: targetQuote.dividend ? targetQuote.fetchedAt : targetStock.dividendFetchedAt,
      dividendPeriod: targetQuote.dividend?.period ?? targetStock.dividendPeriod,
      dividendPeriodStart: targetQuote.dividend?.periodStart ?? targetStock.dividendPeriodStart,
      dividendPeriodEnd: targetQuote.dividend?.periodEnd ?? targetStock.dividendPeriodEnd,
    }
  }, [targetQuote, targetStock])

  const targetYieldPercent = quotedTargetStock && quotedTargetStock.currentPrice > 0
    ? quotedTargetStock.estimatedYieldPercent > 0
      ? quotedTargetStock.estimatedYieldPercent
      : quotedTargetStock.estimatedAnnualDividendPerShare / quotedTargetStock.currentPrice * 100
    : 0
  const simulationTargetStock = useMemo<StockAsset | null>(() => {
    if (!quotedTargetStock || yieldOverridePercent === null) return quotedTargetStock
    return {
      ...quotedTargetStock,
      estimatedAnnualDividendPerShare: quotedTargetStock.currentPrice * yieldOverridePercent / 100,
      estimatedYieldPercent: yieldOverridePercent,
      dividendSource: 'manual',
    }
  }, [quotedTargetStock, yieldOverridePercent])
  const collateralValueTwd = calculateCollateralSelectionsValueTwd(collateralSelections, stocks)
  const simulation = useMemo(() => calculateReinvestmentSimulation({
    base: {
      stockMarketValueTwd: summary.stockMarketValueTwd,
      cashValueTwd: summary.cashValueTwd,
      totalAssetsTwd: summary.totalAssetsTwd,
      totalLiabilitiesTwd: summary.totalLiabilitiesTwd,
      netWorthTwd: summary.netWorthTwd,
      annualEstimatedDividendTwd: summary.annualEstimatedDividendTwd,
      monthlyCashFlowTwd: summary.monthlyCashFlowTwd,
      debtRatioPercent: summary.debtRatioPercent,
      leverageRatio: summary.leverageRatio,
    },
    loanAmountTwd,
    annualInterestRatePercent,
    targetStock: simulationTargetStock,
    investmentAllocationPercent,
    collateralValueTwd,
    warningRatioPercent: settings.maintenanceWarningRatioPercent,
    marginCallRatioPercent: settings.maintenanceMarginCallRatioPercent,
  }), [annualInterestRatePercent, collateralValueTwd, investmentAllocationPercent, loanAmountTwd, settings.maintenanceMarginCallRatioPercent, settings.maintenanceWarningRatioPercent, simulationTargetStock, summary])
  const SimulationStatusIcon = statusIcon(simulation.maintenanceStatus)

  const toggleCollateral = (stock: StockAsset) => {
    setCollateralSelections((current) => current.some((item) => item.stockAssetId === stock.id)
      ? current.filter((item) => item.stockAssetId !== stock.id)
      : [...current, { stockAssetId: stock.id, pledgedShares: stock.shares }])
  }

  const changeCollateralShares = (stockId: string, pledgedShares: number) => {
    setCollateralSelections((current) => current.map((item) => item.stockAssetId === stockId ? { ...item, pledgedShares: Math.max(0, pledgedShares) } : item))
  }

  return (
    <div className="simulation-v03">
      <section className="simulation-intro-card card">
        <div>
          <div className="section-kicker">V0.3 / 借款再投資試算</div>
          <h2>先看 Before / After，<span>再決定要不要放大。</span></h2>
        </div>
        <span className="simulation-local-pill"><ShieldCheck size={15} />純本機試算，不會改動實際資料</span>
      </section>

      <div className="simulation-layout">
        <section className="card simulation-controls-card">
          <div className="section-heading-row simulation-section-heading"><div><div className="section-kicker">方案設定</div><h2>如果現在借這一筆？</h2></div><span className="section-caption">暫不儲存</span></div>

          <div className="simulation-control-group">
            <div className="simulation-control-label"><span>模擬借款金額</span><strong>{formatTwd(loanAmountTwd, displayMode)}</strong></div>
            <input className="simulation-range" type="range" min="0" max={maxLoanAmountTwd} step="10000" value={loanAmountTwd} aria-label="模擬借款金額" onChange={(event) => setLoanAmountTwd(Number(event.target.value))} />
            <div className="range-endpoints"><span>NT$0</span><span>上限 {formatTwd(maxLoanAmountTwd, 'compact')}</span></div>
            <input className="simulation-number-input" type="number" min="0" max={maxLoanAmountTwd} step="10000" value={loanAmountTwd} aria-label="模擬借款金額數字" onChange={(event) => setLoanAmountTwd(Math.min(maxLoanAmountTwd, Math.max(0, Number(event.target.value))))} />
          </div>

          <div className="form-grid form-grid-two simulation-form-grid">
            <label className="form-field"><span>年利率<small>%</small></span><input min="0" step="0.01" type="number" value={annualInterestRatePercent} onChange={(event) => setAnnualInterestRatePercent(Math.max(0, Number(event.target.value)))} /></label>
            <label className="form-field"><span>借款期間<small>月</small></span><input min="1" max="120" step="1" type="number" value={borrowingMonths} onChange={(event) => setBorrowingMonths(Math.min(120, Math.max(1, Number(event.target.value))))} /></label>
            <label className="form-field form-field-wide"><span>還款方式</span><div className="select-wrap"><select value={repaymentMethod} onChange={(event) => setRepaymentMethod(event.target.value as typeof repaymentMethod)}><option value="interest-only">只繳利息</option><option value="equal-principal">本金平均攤還</option><option value="amortized">本息平均攤還</option></select><ChevronDown className="select-chevron" size={16} aria-hidden="true" /></div></label>
          </div>

          <div className="simulation-control-group simulation-collateral-group">
            <div className="simulation-control-label"><span>模擬擔保品</span><strong>{formatTwd(collateralValueTwd, displayMode)}</strong></div>
            <p className="simulation-helper">目前已選股票市值會作為這筆新借款的擔保品。</p>
            {stocks.length === 0 ? <div className="inline-empty">請先到資產管理新增股票。</div> : <div className="simulation-collateral-list">{stocks.map((stock) => {
              const selection = collateralSelections.find((item) => item.stockAssetId === stock.id)
              return <div className={`simulation-collateral-item ${selection ? 'is-selected' : ''}`} key={stock.id}>
                <label className="simulation-collateral-check"><input type="checkbox" checked={Boolean(selection)} onChange={() => toggleCollateral(stock)} /><span className="custom-checkbox"><Check size={13} /></span><span><strong>{stock.symbol}</strong><small>{stock.name} · {formatTwd(stock.shares * stock.currentPrice * (stock.exchangeRateToTwd || 1), displayMode)}</small></span></label>
                {selection && <input className="simulation-shares-input" min="0" max={stock.shares} step="any" type="number" value={selection.pledgedShares || ''} aria-label={`${stock.symbol}質押股數`} onChange={(event) => changeCollateralShares(stock.id, Number(event.target.value))} />}
              </div>
            })}</div>}
          </div>

          <div className="simulation-control-group investment-group">
            <div className="simulation-control-label"><span>借款再投入</span><strong>{investmentAllocationPercent}%</strong></div>
            <label className="form-field"><span>投入標的</span><div className="select-wrap"><select value={targetStockId} onChange={(event) => setTargetStockId(event.target.value)}><option value="">不投入股票，保留現金</option>{stocks.map((stock) => <option value={stock.id} key={stock.id}>{stock.symbol} · {stock.name}</option>)}</select><ChevronDown className="select-chevron" size={16} aria-hidden="true" /></div></label>
            {targetStock && <>
              <label className="form-field"><span>預估年化殖利率<small>股息假設，不含價差</small></span><div className="input-with-suffix"><input min="0" step="0.1" type="number" value={yieldOverridePercent ?? (targetYieldPercent || '')} placeholder="例如 8" onChange={(event) => setYieldOverridePercent(event.target.value === '' ? null : Math.max(0, Number(event.target.value)))} /><em>%</em></div></label>
              <div className={`simulation-yield-note ${targetQuoteStatus === 'error' ? 'is-error' : ''}`} role="status">{targetQuoteStatus === 'loading' && <LoaderCircle size={13} className="spin-icon" />}{targetQuoteStatus !== 'loading' && <Info size={13} />}{targetQuoteStatus === 'idle' && targetYieldPercent > 0 ? `使用資產目前的年化殖利率 ${formatPercent(targetYieldPercent)}；可在本次試算中覆寫。` : targetQuoteStatus === 'idle' ? '尚無配息資料；若不輸入假設，新增年股息會以 0 計算。' : targetQuoteMessage}</div>
            </>}
            <input className="simulation-range" type="range" min="0" max="100" step="5" value={investmentAllocationPercent} aria-label="借款投入比例" onChange={(event) => setInvestmentAllocationPercent(Number(event.target.value))} />
            <div className="range-endpoints"><span>0% 保留現金</span><span>100% 全部投入</span></div>
          </div>

          <div className="simulation-note"><Info size={15} /><span>期間 {borrowingMonths} 個月・{repaymentMethod === 'interest-only' ? '只繳利息' : repaymentMethod === 'equal-principal' ? '本金平均攤還' : '本息平均攤還'}；目前先以起始借款金額估算利息。股息殖利率是現金流假設，不代表保證年化總報酬。</span></div>
        </section>

        <section className="simulation-results-column">
          <article className={`card simulation-risk-card ${statusClass(simulation.maintenanceStatus)}`}>
            <div className="section-heading-row"><div><div className="section-kicker">新借款風控</div><h2>這筆方案，站得住嗎？</h2></div><span className={`risk-badge ${statusClass(simulation.maintenanceStatus)}`}><SimulationStatusIcon size={13} />{statusLabel(simulation.maintenanceStatus)}</span></div>
            <div className="simulation-risk-ratio"><span>初始維持率</span><strong>{maintenanceRatioLabel(simulation.maintenanceRatioPercent, simulation.maintenanceStatus)}</strong></div>
            <p className="simulation-risk-description">{statusDescription(simulation.maintenanceStatus)}</p>
            <div className="simulation-risk-thresholds"><span className="risk-badge risk-badge-warning">警戒 {formatPercent(settings.maintenanceWarningRatioPercent, 0)}</span><span className="risk-badge risk-badge-danger">追繳 {formatPercent(settings.maintenanceMarginCallRatioPercent, 0)}</span><span>距警戒 {formatPercent(simulation.distanceToWarningPoints)}</span></div>
          </article>

          <article className="card simulation-output-card">
            <div className="section-heading-row"><div><div className="section-kicker">再投入結果</div><h2>{targetStock ? `${targetStock.symbol} 會增加多少？` : '借款會留在現金裡'}</h2></div><BarChart3 size={19} className="simulation-output-icon" /></div>
            <div className="simulation-output-grid">
              <div><span>可買股數</span><strong>{formatNumber(simulation.sharesPurchased)}</strong><small>{targetStock?.symbol ?? '未選擇標的'}</small></div>
              <div><span>新增股票市值</span><strong>{formatTwd(simulation.newInvestmentMarketValueTwd, displayMode)}</strong><small>依模擬現價</small></div>
              <div><span>新增年股息</span><strong>{formatTwd(simulation.annualDividendTwd, displayMode)}</strong><small>{targetStock ? `年化殖利率 ${formatPercent(yieldOverridePercent ?? targetYieldPercent)}` : '預估值'}</small></div>
              <div><span>新增年利息</span><strong>{formatTwd(simulation.annualInterestTwd, displayMode)}</strong><small>借款成本</small></div>
              <div><span>新增月利息</span><strong>{formatTwd(simulation.monthlyInterestTwd, displayMode)}</strong><small>年利率 {formatPercent(annualInterestRatePercent)}</small></div>
              <div><span>模擬後現金</span><strong>{formatTwd(simulation.after.cashValueTwd, displayMode)}</strong><small>含未投入借款</small></div>
            </div>
            <div className="simulation-cashflow-callout"><div><span>模擬後月淨現金流</span><strong className={simulation.monthlyNetCashFlowTwd >= 0 ? 'positive-text' : 'negative-text'}>{formatTwd(simulation.monthlyNetCashFlowTwd, displayMode)}</strong></div><span className={simulation.monthlyNetCashFlowTwd >= summary.monthlyCashFlowTwd ? 'simulation-delta positive-text' : 'simulation-delta negative-text'}>{simulation.monthlyNetCashFlowTwd >= summary.monthlyCashFlowTwd ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{formatTwd(simulation.monthlyNetCashFlowTwd - summary.monthlyCashFlowTwd, displayMode)} vs 目前</span></div>
          </article>
        </section>
      </div>

      <section className="card before-after-section">
        <div className="section-heading-row before-after-heading"><div><div className="section-kicker">操作前 / 操作後</div><h2>借款會如何改變你的資產表？</h2></div><span className="section-caption">起始價格不變的靜態試算</span></div>
        <div className="before-after-grid"><SnapshotCard title="現在" snapshot={simulation.before} displayMode={displayMode} tone="before" /><div className="before-after-arrow" aria-hidden="true">→</div><SnapshotCard title="借款並再投入後" snapshot={simulation.after} displayMode={displayMode} tone="after" /></div>
        <div className="before-after-footnote"><CircleDollarSign size={15} /><span>淨資產在起始時點不會因借款增加；改變的是資產組成、負債、槓桿、負債比與每月現金流。</span></div>
      </section>

    </div>
  )
}
