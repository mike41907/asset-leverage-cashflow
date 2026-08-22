import { useMemo, useState } from 'react'
import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import {
  calculatePortfolioTrendChange,
  PORTFOLIO_TREND_RANGES,
  selectPortfolioTrendSnapshots,
  type PortfolioTrendRangeDays,
} from '../domain/portfolioTrends'
import type { NumberDisplayMode, PortfolioSnapshot } from '../domain/models'
import { formatCurrencyWithSign, formatPercent } from '../shared/formatters'

interface PortfolioTrendCardProps {
  snapshots: readonly PortfolioSnapshot[]
  displayMode: NumberDisplayMode
  embedded?: boolean
}

interface ChartPoint {
  x: number
  y: number
  snapshot: PortfolioSnapshot
}

const CHART_WIDTH = 1000
const CHART_HEIGHT = 250
const CHART_PADDING_X = 10
const CHART_PADDING_Y = 18

export function PortfolioTrendCard({ snapshots, displayMode, embedded = false }: PortfolioTrendCardProps) {
  const [selectedRange, setSelectedRange] = useState<PortfolioTrendRangeDays>(365)
  const selectedSnapshots = useMemo(
    () => selectPortfolioTrendSnapshots(snapshots, selectedRange),
    [snapshots, selectedRange],
  )
  const trendChange = useMemo(() => calculatePortfolioTrendChange(selectedSnapshots), [selectedSnapshots])
  const chart = useMemo(() => {
    if (selectedSnapshots.length === 0) return null

    const values = selectedSnapshots.map((snapshot) => snapshot.totalAssetsTwd)
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const valueSpread = Math.max(maximum - minimum, Math.max(Math.abs(maximum) * 0.03, 1_000))
    const chartMinimum = minimum - valueSpread * 0.12
    const chartMaximum = maximum + valueSpread * 0.12
    const usableWidth = CHART_WIDTH - CHART_PADDING_X * 2
    const usableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2
    const points: ChartPoint[] = selectedSnapshots.map((snapshot, index) => {
      const progress = selectedSnapshots.length === 1 ? 0.5 : index / (selectedSnapshots.length - 1)
      const normalized = (snapshot.totalAssetsTwd - chartMinimum) / (chartMaximum - chartMinimum)
      return {
        x: CHART_PADDING_X + usableWidth * progress,
        y: CHART_PADDING_Y + usableHeight * (1 - normalized),
        snapshot,
      }
    })
    const linePath = points.length === 1
      ? `M ${CHART_PADDING_X} ${points[0].y} L ${CHART_WIDTH - CHART_PADDING_X} ${points[0].y}`
      : points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    const areaPath = `${linePath} L ${CHART_WIDTH - CHART_PADDING_X} ${CHART_HEIGHT - CHART_PADDING_Y} L ${CHART_PADDING_X} ${CHART_HEIGHT - CHART_PADDING_Y} Z`

    return { points, linePath, areaPath }
  }, [selectedSnapshots])

  const selectedRangeLabel = PORTFOLIO_TREND_RANGES.find((range) => range.days === selectedRange)?.label ?? '365日'
  const hasEnoughData = selectedSnapshots.length >= 2
  const changeClass = trendChange && trendChange.changeTwd < 0 ? 'negative-text' : 'positive-text'
  const ChangeIcon = trendChange && trendChange.changeTwd < 0 ? TrendingDown : TrendingUp

  return (
    <section className={`${embedded ? 'portfolio-trend-card portfolio-trend-embedded' : 'card portfolio-trend-card'}`}>
      <div className="portfolio-trend-header">
        <div>
          <div className="section-kicker">資產趨勢</div>
          <h2>{selectedRangeLabel}資產變化</h2>
        </div>
        <div className={`portfolio-trend-change ${trendChange ? changeClass : ''}`}>
          {trendChange && <ChangeIcon size={17} />}
          <div>
            <strong>{trendChange ? formatCurrencyWithSign(trendChange.changeTwd, displayMode) : '—'}</strong>
            <span>{trendChange ? `(${formatPercent(trendChange.changePercent)})` : '等待累積歷史資料'}</span>
          </div>
        </div>
      </div>

      <div className={`portfolio-trend-chart ${chart ? '' : 'is-empty'}`}>
        {chart ? (
          <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${selectedRangeLabel}總資產變化曲線`}>
            <title>{`${selectedRangeLabel}總資產變化曲線`}</title>
            {[0, 1, 2, 3].map((line) => {
              const y = CHART_PADDING_Y + ((CHART_HEIGHT - CHART_PADDING_Y * 2) / 3) * line
              return <line className="portfolio-trend-grid-line" key={line} x1={CHART_PADDING_X} x2={CHART_WIDTH - CHART_PADDING_X} y1={y} y2={y} />
            })}
            <defs>
              <linearGradient id="portfolio-trend-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--teal)" stopOpacity=".24" />
                <stop offset="100%" stopColor="var(--teal)" stopOpacity=".02" />
              </linearGradient>
            </defs>
            <path className="portfolio-trend-area" d={chart.areaPath} />
            <path className="portfolio-trend-line" d={chart.linePath} />
            <circle className="portfolio-trend-point" cx={chart.points[chart.points.length - 1].x} cy={chart.points[chart.points.length - 1].y} r="5" />
          </svg>
        ) : (
          <div className="portfolio-trend-empty"><Activity size={21} /><strong>尚未累積歷史資料</strong><span>持續使用 APP 並更新行情後，這裡會顯示資產變化。</span></div>
        )}
      </div>

      {!hasEnoughData && chart && <div className="portfolio-trend-note">目前已記錄 {snapshots.length} 個時間點，持續更新後會形成完整曲線。</div>}

      <div className="portfolio-trend-ranges" role="tablist" aria-label="資產趨勢期間">
        {PORTFOLIO_TREND_RANGES.map((range) => (
          <button
            type="button"
            role="tab"
            aria-selected={selectedRange === range.days}
            className={selectedRange === range.days ? 'is-active' : ''}
            key={range.days}
            onClick={() => setSelectedRange(range.days)}
          >
            {range.label}
          </button>
        ))}
      </div>
    </section>
  )
}
