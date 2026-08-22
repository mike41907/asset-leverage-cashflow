import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Coins,
  Landmark,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import type { AppState, PageKey } from '../domain/models'
import {
  calculateStockMarketValue,
  calculateStockUnrealizedGainPercent,
  calculatePassiveIncomeCoveragePercent,
  type PortfolioSummary,
} from '../domain/calculations'
import { formatCurrencyWithSign, formatPercent, formatTwd } from '../shared/formatters'
import { MetricCard } from '../components/MetricCard'
import { EmptyState } from '../components/EmptyState'
import { PortfolioTrendCard } from '../components/PortfolioTrendCard'

interface DashboardPageProps {
  state: AppState
  summary: PortfolioSummary
  onNavigate: (page: PageKey) => void
}

export function DashboardPage({ state, summary, onNavigate }: DashboardPageProps) {
  const displayMode = state.settings.numberDisplayMode
  const hasAssets = state.stocks.length > 0 || state.cash.length > 0 || state.cryptos.length > 0 || state.realEstate.length > 0
  const hasLoans = state.loans.length > 0
  const totalAssets = summary.totalAssetsTwd || 1
  const stockShare = (summary.stockMarketValueTwd / totalAssets) * 100
  const cashShare = (summary.cashValueTwd / totalAssets) * 100
  const cryptoShare = (summary.cryptoMarketValueTwd / totalAssets) * 100
  const realEstateShare = (summary.realEstateValueTwd / totalAssets) * 100
  const topStocks = [...state.stocks]
    .sort((left, right) => calculateStockMarketValue(right) - calculateStockMarketValue(left))
    .slice(0, 4)
  const maintenanceValue = summary.maintenanceStatus === 'unavailable' ? '—' : formatPercent(summary.maintenanceRatioPercent)
  const maintenanceTitle = !hasLoans ? '尚未設定質押' : summary.maintenanceStatus === 'safe' ? '維持率安全' : summary.maintenanceStatus === 'warning' ? '維持率進入警戒' : summary.maintenanceStatus === 'danger' ? '維持率已低於追繳線' : '維持率暫時無法判讀'
  const maintenanceDescription = !hasLoans ? '尚未設定借款' : `警戒線 ${formatPercent(state.settings.maintenanceWarningRatioPercent, 0)}`
  const MaintenanceIcon = summary.maintenanceStatus === 'safe' ? ShieldCheck : CircleAlert
  const monthlyOutflowTwd = summary.monthlyExpenseTwd + summary.monthlyDebtServiceTwd
  const passiveCoveragePercent = calculatePassiveIncomeCoveragePercent(summary.monthlyEstimatedDividendTwd, monthlyOutflowTwd)
  const passiveCoverageValue = passiveCoveragePercent === null ? '—' : formatPercent(passiveCoveragePercent)
  const passiveCoverageClass = passiveCoveragePercent === null ? '' : passiveCoveragePercent >= 100 ? 'positive-text' : 'warning-text'
  const manualPriceCount = state.stocks.filter((stock) => stock.market !== 'OTHER' && stock.currentPriceSource !== 'yahoo-public').length

  return (
    <div className="page-container dashboard-page">
      {!hasAssets ? (
        <section className="card empty-card">
          <EmptyState
            icon={WalletCards}
            title="還沒有資產資料"
            description="新增第一筆股票、現金或虛擬貨幣，首頁會即時建立你的資產負債表。"
            actionLabel="前往資產管理"
            onAction={() => onNavigate('assets')}
          />
        </section>
      ) : (
        <>
          <section className="hero-metrics">
            <div className="primary-net-worth-card">
              <div className="primary-card-glow primary-card-glow-one" />
              <div className="primary-card-glow primary-card-glow-two" />
              <div className="primary-card-content">
                <div className="primary-card-label"><span className="live-dot" />目前資產總覽</div>
                <div className="primary-card-value">{formatTwd(summary.totalAssetsTwd, displayMode)}</div>
                <div className="primary-card-meta">
                  <span>淨資產 {formatTwd(summary.netWorthTwd, displayMode)}</span>
                  <span className="meta-divider" />
                  <span>負債 {formatTwd(summary.totalLiabilitiesTwd, displayMode)}</span>
                  <span className="meta-divider" />
                  <span>房產 {formatTwd(summary.realEstateValueTwd, displayMode)}</span>
                </div>
              </div>
            </div>

            <div className="metric-grid">
              <MetricCard
                label="股票市值"
                value={formatTwd(summary.stockMarketValueTwd, displayMode)}
                description={`${state.stocks.length} 筆持倉`}
                icon={BarChart3}
                tone="teal"
              />
              <MetricCard
                label="現金資產"
                value={formatTwd(summary.cashValueTwd, displayMode)}
                description={`${state.cash.length} 筆現金`}
                icon={Banknote}
                tone="violet"
              />
              <MetricCard
                label="虛擬貨幣"
                value={formatTwd(summary.cryptoMarketValueTwd, displayMode)}
                description={`${state.cryptos.length} 筆資產`}
                icon={Coins}
                tone="amber"
              />
              <MetricCard
                label="每月淨現金流"
                value={formatCurrencyWithSign(summary.monthlyCashFlowTwd, displayMode)}
                description="收入 − 支出與借款成本"
                icon={CircleDollarSign}
                tone="amber"
              />
              <MetricCard
                label="每月支出"
                value={formatTwd(monthlyOutflowTwd, displayMode)}
                description="固定支出＋貸款付款"
                icon={ReceiptText}
                tone="navy"
              />
              <MetricCard
                label="股息覆蓋率"
                value={passiveCoverageValue}
                description={passiveCoveragePercent === null ? '先設定固定支出或貸款付款' : '預估股息 ÷ 每月支出'}
                icon={Landmark}
                tone="teal"
                valueClassName={passiveCoverageClass}
              />
            </div>
          </section>

          <PortfolioTrendCard snapshots={state.portfolioSnapshots} displayMode={displayMode} />

          <section className="dashboard-grid dashboard-grid-main">
            <article className="card portfolio-mix-card">
              <div className="section-heading-row">
                <div>
                  <div className="section-kicker">資產配置</div>
                  <h2>資產配置</h2>
                </div>
                <span className="section-caption">TWD</span>
              </div>
              <div className="mix-visual">
                <div className="donut-chart" style={{ '--stock-share': `${Math.min(100, stockShare)}%`, '--cash-share': `${Math.min(100, cashShare)}%`, '--real-estate-share': `${Math.min(100, realEstateShare)}%`, '--crypto-share': `${Math.min(100, cryptoShare)}%` } as React.CSSProperties}>
                  <div className="donut-center">
                    <strong>{Math.round(stockShare)}%</strong>
                    <span>股票</span>
                  </div>
                </div>
                <div className="mix-legend">
                  <div className="mix-legend-item">
                    <span className="legend-dot legend-dot-stock" />
                    <div><strong>股票</strong><span>{formatTwd(summary.stockMarketValueTwd, displayMode)}</span></div>
                    <em>{formatPercent(stockShare, 0)}</em>
                  </div>
                  <div className="mix-legend-item">
                    <span className="legend-dot legend-dot-cash" />
                    <div><strong>現金</strong><span>{formatTwd(summary.cashValueTwd, displayMode)}</span></div>
                    <em>{formatPercent(cashShare, 0)}</em>
                  </div>
                  <div className="mix-legend-item">
                    <span className="legend-dot legend-dot-real-estate" />
                    <div><strong>房產</strong><span>{formatTwd(summary.realEstateValueTwd, displayMode)}</span></div>
                    <em>{formatPercent(realEstateShare, 0)}</em>
                  </div>
                  <div className="mix-legend-item">
                    <span className="legend-dot legend-dot-crypto" />
                    <div><strong>虛擬貨幣</strong><span>{formatTwd(summary.cryptoMarketValueTwd, displayMode)}</span></div>
                    <em>{formatPercent(cryptoShare, 0)}</em>
                  </div>
                </div>
              </div>
              <div className="mix-bar" aria-label="股票、現金、房產與虛擬貨幣配置比例">
                <span className="mix-bar-stock" style={{ width: `${Math.min(100, stockShare)}%` }} />
                <span className="mix-bar-cash" style={{ width: `${Math.min(100, cashShare)}%` }} />
                <span className="mix-bar-real-estate" style={{ width: `${Math.min(100, realEstateShare)}%` }} />
                <span className="mix-bar-crypto" style={{ width: `${Math.min(100, cryptoShare)}%` }} />
              </div>
              <div className="mix-metric-row"><div><span>擔保品市值</span><strong>{formatTwd(summary.collateralValueTwd, displayMode)}</strong></div><div><span>總負債</span><strong>{formatTwd(summary.totalLiabilitiesTwd, displayMode)}</strong></div></div>
            </article>

            <article className="card health-card">
              <div className="section-heading-row">
                <div>
                  <div className="section-kicker">資產健康度</div>
                  <h2>槓桿與現金流安全度</h2>
                </div>
                <div className={`health-icon health-icon-${summary.maintenanceStatus}`}><MaintenanceIcon size={20} /></div>
              </div>
              <div className={`health-status health-status-${summary.maintenanceStatus}`}>
                <div className="health-status-icon"><MaintenanceIcon size={20} /></div>
                <div><strong>{maintenanceTitle}</strong><span>{maintenanceDescription}</span></div>
              </div>
              <div className="health-stats">
                <div><span>維持率</span><strong className={`status-text status-${summary.maintenanceStatus}`}>{maintenanceValue}</strong></div>
                <div><span>負債比</span><strong>{formatPercent(summary.debtRatioPercent)}</strong></div>
                <div><span>月淨現金流</span><strong className={summary.monthlyCashFlowTwd >= 0 ? 'positive-text' : 'negative-text'}>{formatTwd(summary.monthlyCashFlowTwd, displayMode)}</strong></div>
              </div>
              <div className="dashboard-cashflow-kpis"><div><span>月股息</span><strong className="positive-text">{formatTwd(summary.monthlyEstimatedDividendTwd, displayMode)}</strong></div><div><span>月利息</span><strong className="negative-text">{formatTwd(summary.monthlyLoanInterestTwd, displayMode)}</strong></div><div><span>月本金</span><strong className="negative-text">{formatTwd(summary.monthlyLoanPrincipalTwd, displayMode)}</strong></div></div>
              <div className="health-actions"><button type="button" className="text-button" onClick={() => onNavigate('simulation')}>查看質押模擬規劃 <ChevronRight size={15} /></button><button type="button" className="text-button" onClick={() => onNavigate('cashflow')}>管理每月現金流 <ChevronRight size={15} /></button></div>
            </article>
          </section>

          <section className="dashboard-grid dashboard-grid-bottom">
            <article className="card holdings-card">
              <div className="section-heading-row">
                <div>
                  <div className="section-kicker">持倉快照</div>
                  <h2>股票資產</h2>
                </div>
                <button type="button" className="text-button" onClick={() => onNavigate('assets')}>查看全部 <ChevronRight size={15} /></button>
              </div>
              {topStocks.length > 0 ? (
                <div className="holdings-list">
                  {topStocks.map((stock) => {
                    const gainPercent = calculateStockUnrealizedGainPercent(stock)
                    const isPositive = (gainPercent ?? 0) >= 0
                    return (
                      <div className="holding-row" key={stock.id}>
                        <div className="holding-symbol"><span>{stock.symbol.slice(0, 2)}</span><div><strong>{stock.symbol}</strong><small>{stock.name}</small></div></div>
                        <div className="holding-value"><strong>{formatTwd(calculateStockMarketValue(stock), displayMode)}</strong><small className={isPositive ? 'positive-text' : 'negative-text'}>{isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{formatPercent(gainPercent)}</small></div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="inline-empty">前往資產管理新增股票。</div>
              )}
            </article>

            <article className="card dashboard-focus-card">
              <div className="section-heading-row">
                <div><div className="section-kicker">重點數據</div><h2>今天先看這四項</h2></div>
                <button type="button" className="text-button" onClick={() => onNavigate('assets')}>查看資產 <ChevronRight size={15} /></button>
              </div>
              <div className="dashboard-focus-grid">
                <div><span>淨資產</span><strong>{formatTwd(summary.netWorthTwd, displayMode)}</strong><small>總資產 − 負債</small></div>
                <div><span>預估年配息</span><strong className="positive-text">{formatTwd(summary.annualEstimatedDividendTwd, displayMode)}</strong><small>目前持股估算</small></div>
                <div><span>擔保品市值</span><strong>{formatTwd(summary.collateralValueTwd, displayMode)}</strong><small>{hasLoans ? '質押計算基準' : '尚未設定質押'}</small></div>
                <div><span>待更新行情</span><strong className={manualPriceCount > 0 ? 'warning-text' : 'positive-text'}>{manualPriceCount}</strong><small>台股／美股</small></div>
              </div>
            </article>
          </section>

        </>
      )}
    </div>
  )
}
