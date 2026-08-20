import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Landmark,
  Plus,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import type { AppState, PageKey } from '../domain/models'
import {
  calculateStockMarketValue,
  calculateStockUnrealizedGainPercent,
  type PortfolioSummary,
} from '../domain/calculations'
import { formatCurrencyWithSign, formatPercent, formatRatio, formatTwd } from '../shared/formatters'
import { MetricCard } from '../components/MetricCard'
import { EmptyState } from '../components/EmptyState'

interface DashboardPageProps {
  state: AppState
  summary: PortfolioSummary
  onNavigate: (page: PageKey) => void
}

export function DashboardPage({ state, summary, onNavigate }: DashboardPageProps) {
  const displayMode = state.settings.numberDisplayMode
  const hasAssets = state.stocks.length > 0 || state.cash.length > 0
  const totalAssets = summary.totalAssetsTwd || 1
  const stockShare = (summary.stockMarketValueTwd / totalAssets) * 100
  const cashShare = (summary.cashValueTwd / totalAssets) * 100
  const topStocks = [...state.stocks]
    .sort((left, right) => calculateStockMarketValue(right) - calculateStockMarketValue(left))
    .slice(0, 4)

  return (
    <div className="page-container">
      <section className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-mark" />資產控制台 / V0.1</div>
          <h1>先看清楚，<span>再決定要不要加槓桿。</span></h1>
          <p>把股票、現金與未來的借款風險放在同一張資產負債表裡。</p>
        </div>
        <div className="heading-actions">
          <span className="local-data-pill"><ShieldCheck size={15} />資料僅存在本機</span>
          <button type="button" className="button button-primary" onClick={() => onNavigate('assets')}>
            <Plus size={17} />新增資產
          </button>
        </div>
      </section>

      {!hasAssets ? (
        <section className="card empty-card">
          <EmptyState
            icon={WalletCards}
            title="還沒有資產資料"
            description="新增第一筆股票或現金，首頁會即時建立你的資產負債表。"
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
                </div>
              </div>
              <div className="primary-card-chart" aria-hidden="true">
                <span style={{ height: '36%' }} />
                <span style={{ height: '48%' }} />
                <span style={{ height: '42%' }} />
                <span style={{ height: '63%' }} />
                <span style={{ height: '58%' }} />
                <span style={{ height: '76%' }} />
                <span style={{ height: '91%' }} />
              </div>
            </div>

            <div className="metric-grid">
              <MetricCard
                label="淨資產"
                value={formatTwd(summary.netWorthTwd, displayMode)}
                description="總資產 − 總負債"
                icon={Landmark}
                tone="navy"
              />
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
                label="每月股息預估"
                value={formatTwd(summary.monthlyEstimatedDividendTwd, displayMode)}
                description="依手動輸入的配息估算"
                icon={CircleDollarSign}
                tone="amber"
              />
            </div>
          </section>

          <section className="dashboard-grid dashboard-grid-main">
            <article className="card portfolio-mix-card">
              <div className="section-heading-row">
                <div>
                  <div className="section-kicker">資產配置</div>
                  <h2>錢現在放在哪裡？</h2>
                </div>
                <span className="section-caption">TWD</span>
              </div>
              <div className="mix-visual">
                <div className="donut-chart" style={{ '--stock-share': `${Math.min(100, stockShare)}%` } as React.CSSProperties}>
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
                </div>
              </div>
              <div className="mix-bar" aria-label="股票與現金配置比例">
                <span className="mix-bar-stock" style={{ width: `${Math.min(100, stockShare)}%` }} />
                <span className="mix-bar-cash" style={{ width: `${Math.min(100, cashShare)}%` }} />
              </div>
              <p className="card-footnote">目前尚未建立質押借款，負債為 NT$0。V0.2 將在此加入維持率與槓桿風險。</p>
            </article>

            <article className="card health-card">
              <div className="section-heading-row">
                <div>
                  <div className="section-kicker">資產健康度</div>
                  <h2>先建立基準線</h2>
                </div>
                <div className="health-icon"><ShieldCheck size={20} /></div>
              </div>
              <div className="health-status">
                <div className="health-status-icon"><CircleAlert size={20} /></div>
                <div><strong>尚未設定質押</strong><span>目前沒有借款資料可進行維持率判讀。</span></div>
              </div>
              <div className="health-stats">
                <div><span>負債比</span><strong>{formatPercent(summary.debtRatioPercent)}</strong></div>
                <div><span>資產槓桿</span><strong>{formatRatio(summary.leverageRatio)}</strong></div>
                <div><span>月淨現金流</span><strong className={summary.monthlyCashFlowTwd >= 0 ? 'positive-text' : 'negative-text'}>{formatTwd(summary.monthlyCashFlowTwd, displayMode)}</strong></div>
              </div>
              <button type="button" className="text-button" onClick={() => onNavigate('simulation')}>
                查看質押模擬規劃 <ChevronRight size={15} />
              </button>
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

            <article className="card next-step-card">
              <div className="next-step-accent" />
              <div className="section-kicker">V0.1 完成項目</div>
              <h2>你的資產基準線已建立。</h2>
              <p>先把持倉與現金輸入正確，下一階段才能看懂借款與再投資帶來的變化。</p>
              <div className="next-step-list">
                <div><span className="check-icon">✓</span>總資產與淨資產分離計算</div>
                <div><span className="check-icon">✓</span>資料保存在本機 IndexedDB</div>
                <div><span className="pending-icon">→</span>V0.2 加入質押與維持率</div>
              </div>
              <button type="button" className="button button-secondary button-full" onClick={() => onNavigate('settings')}>
                檢視本機與顯示設定
              </button>
            </article>
          </section>

          <div className="formula-note"><span className="formula-note-mark">Σ</span><span><strong>計算原則：</strong>淨資產永遠等於總資產減去總負債；借款不是收入，也不會直接增加淨資產。</span></div>
        </>
      )}
    </div>
  )
}
