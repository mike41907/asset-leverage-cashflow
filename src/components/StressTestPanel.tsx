import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownRight, BarChart3, Info, ShieldCheck, TrendingDown } from 'lucide-react'
import type { AppSettings, Collateral, Loan, StockAsset } from '../domain/models'
import {
  calculateMarginCallDrop,
  calculateMaintenanceOverview,
  calculateStressTest,
  type MaintenanceStatus,
  type PortfolioSummary,
} from '../domain/calculations'
import { formatCurrencyWithSign, formatNumber, formatPercent, formatTwd } from '../shared/formatters'

interface StressTestPanelProps {
  stocks: StockAsset[]
  loans: Loan[]
  collaterals: Collateral[]
  settings: AppSettings
  summary: PortfolioSummary
  displayMode: 'exact' | 'compact'
}

const quickDrops = [5, 10, 20, 30, 40, 50]

function statusLabel(status: MaintenanceStatus): string {
  if (status === 'safe') return '安全'
  if (status === 'warning') return '警戒'
  if (status === 'danger') return '追繳風險'
  return '尚無法判讀'
}

function statusDescription(status: MaintenanceStatus, hasLoans: boolean): string {
  if (!hasLoans) return '目前沒有實際借款，壓力測試仍會先展示資產與淨資產的變化；建立借款後才會判讀維持率。'
  if (status === 'safe') return '即使套用目前跌幅，維持率仍高於警戒線。請把這個數字當作風險距離，而不是保證。'
  if (status === 'warning') return '壓力情境已進入警戒區，建議先檢查可用現金、還款安排與擔保品配置。'
  if (status === 'danger') return '壓力情境已低於追繳線，請優先檢查借款餘額與補繳／降槓桿方案。'
  return '建立借款與擔保品後，這裡會顯示壓力情境下的維持率。'
}

function statusIcon(status: MaintenanceStatus) {
  return status === 'safe' ? ShieldCheck : AlertTriangle
}

function statusClass(status: MaintenanceStatus): string {
  return `status-${status}`
}

function maintenanceRatioLabel(ratioPercent: number, status: MaintenanceStatus): string {
  return status === 'unavailable' ? '—' : formatPercent(ratioPercent)
}

function dropToLineLabel(dropPercent: number | null): string {
  if (dropPercent === null) return '尚無法判讀'
  if (dropPercent === 0) return '目前已碰線'
  return `約 -${formatPercent(dropPercent)}`
}

function StressSnapshot({
  title,
  kicker,
  stockMarketValueTwd,
  collateralValueTwd,
  totalAssetsTwd,
  netWorthTwd,
  displayMode,
  tone,
}: {
  title: string
  kicker: string
  stockMarketValueTwd: number
  collateralValueTwd: number
  totalAssetsTwd: number
  netWorthTwd: number
  displayMode: 'exact' | 'compact'
  tone: 'current' | 'stress'
}) {
  return (
    <article className={`stress-snapshot-card stress-snapshot-card-${tone}`}>
      <div className="stress-snapshot-heading"><span className="stress-snapshot-dot" /><div><div className="section-kicker">{kicker}</div><h3>{title}</h3></div></div>
      <div className="stress-snapshot-metrics">
        <div><span>股票市值</span><strong>{formatTwd(stockMarketValueTwd, displayMode)}</strong></div>
        <div><span>擔保品市值</span><strong>{formatTwd(collateralValueTwd, displayMode)}</strong></div>
        <div><span>總資產</span><strong>{formatTwd(totalAssetsTwd, displayMode)}</strong></div>
        <div><span>淨資產</span><strong>{formatTwd(netWorthTwd, displayMode)}</strong></div>
      </div>
    </article>
  )
}

function ChangeMetric({ label, value, displayMode }: { label: string; value: number; displayMode: 'exact' | 'compact' }) {
  return <div className={`stress-change-metric ${value < 0 ? 'is-negative' : value > 0 ? 'is-positive' : ''}`}><span>{label}</span><strong>{formatCurrencyWithSign(value, displayMode)}</strong><ArrowDownRight size={14} /></div>
}

export function StressTestPanel({ stocks, loans, collaterals, settings, summary, displayMode }: StressTestPanelProps) {
  const [dropPercent, setDropPercent] = useState(20)
  const stress = useMemo(() => calculateStressTest({
    stockMarketValueTwd: summary.stockMarketValueTwd,
    collateralValueTwd: summary.collateralValueTwd,
    totalAssetsTwd: summary.totalAssetsTwd,
    totalLiabilitiesTwd: summary.totalLiabilitiesTwd,
    loanBalanceTwd: summary.totalLiabilitiesTwd,
    dropPercent,
  }), [dropPercent, summary])
  const stressOverview = useMemo(() => calculateMaintenanceOverview(
    stress.collateralValueTwd,
    summary.totalLiabilitiesTwd,
    settings.maintenanceWarningRatioPercent,
    settings.maintenanceMarginCallRatioPercent,
  ), [settings.maintenanceMarginCallRatioPercent, settings.maintenanceWarningRatioPercent, stress.collateralValueTwd, summary.totalLiabilitiesTwd])
  const warningDrop = calculateMarginCallDrop(summary.collateralValueTwd, summary.totalLiabilitiesTwd, settings.maintenanceWarningRatioPercent)
  const marginDrop = calculateMarginCallDrop(summary.collateralValueTwd, summary.totalLiabilitiesTwd, settings.maintenanceMarginCallRatioPercent)
  const StressStatusIcon = statusIcon(stressOverview.status)

  const updateDrop = (value: number) => setDropPercent(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)))

  return (
    <div className="stress-test-v04">
      <section className="stress-intro-card card">
        <div>
          <div className="section-kicker">V0.4 / 市場壓力測試</div>
          <h2>先問最壞情境，<span>再決定槓桿上限。</span></h2>
          <p>把股價下跌套入目前的股票、擔保品與借款，觀察維持率、總資產與淨資產會怎麼變。現在有 {stocks.length} 筆股票、{loans.length} 筆借款與 {collaterals.length} 筆擔保品資料。</p>
        </div>
        <span className="stress-local-pill"><ShieldCheck size={15} />只做試算，不改動資料</span>
      </section>

      <section className="card stress-control-card">
        <div className="section-heading-row"><div><div className="section-kicker">市場跌幅</div><h2>如果股票市場下跌這麼多？</h2></div><span className="stress-selected-drop">跌幅 {formatPercent(dropPercent, 0)}</span></div>
        <div className="stress-quick-actions" aria-label="快速選擇市場跌幅">
          {quickDrops.map((value) => <button type="button" key={value} className={dropPercent === value ? 'is-active' : ''} aria-pressed={dropPercent === value} onClick={() => updateDrop(value)}>-{value}%</button>)}
        </div>
        <div className="stress-slider-row">
          <input className="stress-range" type="range" min="0" max="100" step="1" value={dropPercent} aria-label="自訂市場跌幅" onChange={(event) => updateDrop(Number(event.target.value))} />
          <label className="stress-number-field"><span>自訂</span><input type="number" min="0" max="100" step="1" value={dropPercent} aria-label="自訂市場跌幅數字" onChange={(event) => updateDrop(Number(event.target.value))} /><em>%</em></label>
        </div>
        <div className="range-endpoints stress-range-endpoints"><span>0% 不變</span><span>100% 歸零</span></div>
        <div className="stress-assumption-note"><Info size={15} /><span>計算假設股票與擔保品同步下跌，現金、借款餘額與利率維持不變；這是風險情境試算，不是即時行情或金融機構通知。</span></div>
      </section>

      <div className="stress-results-layout">
        <section className={`card stress-risk-card ${statusClass(stressOverview.status)}`}>
          <div className="section-heading-row"><div><div className="section-kicker">壓力後維持率</div><h2>這個跌幅，撐得住嗎？</h2></div><span className={`risk-badge ${statusClass(stressOverview.status)}`}><StressStatusIcon size={13} />{statusLabel(stressOverview.status)}</span></div>
          <div className="stress-risk-ratio"><span>套用跌幅 {formatPercent(dropPercent, 0)}</span><strong>{maintenanceRatioLabel(stressOverview.ratioPercent, stressOverview.status)}</strong></div>
          <p className="stress-risk-description">{statusDescription(stressOverview.status, loans.length > 0)}</p>
          <div className="stress-thresholds"><span className="risk-badge risk-badge-warning">警戒線 {formatPercent(settings.maintenanceWarningRatioPercent, 0)}</span><span className="risk-badge risk-badge-danger">追繳線 {formatPercent(settings.maintenanceMarginCallRatioPercent, 0)}</span><span>距警戒 {stressOverview.distanceToWarningPoints === null ? '—' : formatPercent(stressOverview.distanceToWarningPoints)}</span><span>距追繳 {stressOverview.distanceToMarginCallPoints === null ? '—' : formatPercent(stressOverview.distanceToMarginCallPoints)}</span></div>
          <div className="stress-risk-meter" aria-label="壓力後維持率相對於警戒線"><span className={`risk-meter-fill ${statusClass(stressOverview.status)}`} style={{ width: `${stressOverview.status === 'unavailable' ? 0 : Math.min(100, Math.max(0, (stressOverview.ratioPercent / Math.max(1, settings.maintenanceWarningRatioPercent)) * 100))}%` }} /></div>
        </section>

        <section className="card stress-result-card">
          <div className="section-heading-row"><div><div className="section-kicker">壓力後核心結果</div><h2>資產表會變成什麼？</h2></div><TrendingDown size={19} className="stress-result-icon" /></div>
          <div className="stress-result-grid">
            <div><span>股票市值</span><strong>{formatTwd(stress.stockMarketValueTwd, displayMode)}</strong><small>下跌後</small></div>
            <div><span>擔保品市值</span><strong>{formatTwd(stress.collateralValueTwd, displayMode)}</strong><small>同步下跌</small></div>
            <div><span>淨資產</span><strong>{formatTwd(stress.netWorthTwd, displayMode)}</strong><small className="negative-text">減少 {formatPercent(stress.netWorthDropPercent)}</small></div>
            <div><span>負債比</span><strong>{formatPercent(stress.totalAssetsTwd > 0 ? (summary.totalLiabilitiesTwd / stress.totalAssetsTwd) * 100 : 0)}</strong><small>借款餘額不變</small></div>
          </div>
        </section>
      </div>

      <section className="card stress-compare-section">
        <div className="section-heading-row stress-compare-heading"><div><div className="section-kicker">目前 / 壓力後</div><h2>同一張資產表，放進下跌情境。</h2></div><span className="section-caption">跌幅 {formatPercent(dropPercent, 0)}</span></div>
        <div className="stress-compare-grid">
          <StressSnapshot title="目前狀態" kicker="基準線" stockMarketValueTwd={summary.stockMarketValueTwd} collateralValueTwd={summary.collateralValueTwd} totalAssetsTwd={summary.totalAssetsTwd} netWorthTwd={summary.netWorthTwd} displayMode={displayMode} tone="current" />
          <div className="stress-arrow" aria-hidden="true">→</div>
          <StressSnapshot title={`下跌 ${formatPercent(dropPercent, 0)}`} kicker="壓力情境" stockMarketValueTwd={stress.stockMarketValueTwd} collateralValueTwd={stress.collateralValueTwd} totalAssetsTwd={stress.totalAssetsTwd} netWorthTwd={stress.netWorthTwd} displayMode={displayMode} tone="stress" />
        </div>
        <div className="stress-change-grid">
          <ChangeMetric label="股票市值變化" value={stress.stockMarketValueTwd - summary.stockMarketValueTwd} displayMode={displayMode} />
          <ChangeMetric label="擔保品變化" value={stress.collateralValueTwd - summary.collateralValueTwd} displayMode={displayMode} />
          <ChangeMetric label="總資產變化" value={stress.totalAssetsTwd - summary.totalAssetsTwd} displayMode={displayMode} />
          <ChangeMetric label="淨資產變化" value={stress.netWorthTwd - summary.netWorthTwd} displayMode={displayMode} />
        </div>
      </section>

      <section className="card stress-reverse-card">
        <div className="section-heading-row"><div><div className="section-kicker">反推碰線位置</div><h2>股價跌多少，會碰到風控線？</h2></div><BarChart3 size={19} className="stress-result-icon" /></div>
        <div className="stress-reverse-grid">
          <div className="stress-reverse-item"><span>跌到警戒線</span><strong>{dropToLineLabel(warningDrop)}</strong><small>維持率 {formatPercent(settings.maintenanceWarningRatioPercent, 0)}</small></div>
          <div className="stress-reverse-item stress-reverse-item-danger"><span>跌到追繳線</span><strong>{dropToLineLabel(marginDrop)}</strong><small>維持率 {formatPercent(settings.maintenanceMarginCallRatioPercent, 0)}</small></div>
        </div>
        <div className="stress-note"><ArrowDownRight size={15} /><span>{loans.length > 0 ? '反推以目前擔保品市值與借款餘額估算；實際金融機構可能依個別股票折算率、集中度與契約條件判定。' : '尚未建立借款，因此沒有可反推的實際維持率線；先用上方跌幅觀察資產與淨資產變化。'}</span></div>
      </section>

      <div className="formula-note"><span className="formula-note-mark">↓</span><span><strong>本頁計算原則：</strong>所有股票與已登錄擔保品按相同跌幅縮放；現金與借款不變，因此淨資產下滑金額等於股票市值下滑金額。</span></div>
    </div>
  )
}
