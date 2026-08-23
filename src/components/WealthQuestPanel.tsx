import {
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppState, PageKey } from '../domain/models'
import type { PortfolioSummary } from '../domain/calculations'
import { formatCurrencyWithSign, formatTwd } from '../shared/formatters'

interface WealthQuestPanelProps {
  state: AppState
  summary: PortfolioSummary
  onNavigate: (page: PageKey) => void
}

interface WealthMission {
  title: string
  description: string
  icon: LucideIcon
  isComplete: boolean
  page: PageKey
}

const WEALTH_MILESTONES = [0, 100_000, 300_000, 500_000, 1_000_000, 3_000_000, 5_000_000, 10_000_000]
const WEALTH_TITLES = ['起點探索者', '資產新手', '穩定累積者', '現金流玩家', '財富建設者', '資產指揮官', '自由航行者', '財富領航者']

function getWealthProgress(netWorthTwd: number) {
  const normalizedNetWorth = Math.max(0, netWorthTwd)
  let milestoneIndex = 0
  WEALTH_MILESTONES.forEach((milestone, index) => {
    if (normalizedNetWorth >= milestone) milestoneIndex = index
  })
  const currentMilestone = WEALTH_MILESTONES[milestoneIndex]
  const nextMilestone = WEALTH_MILESTONES[milestoneIndex + 1] ?? Math.max(1, currentMilestone * 2)
  const range = Math.max(1, nextMilestone - currentMilestone)
  const progressPercent = Math.min(100, Math.max(0, ((normalizedNetWorth - currentMilestone) / range) * 100))

  return {
    level: milestoneIndex + 1,
    title: WEALTH_TITLES[milestoneIndex] ?? WEALTH_TITLES[0],
    currentMilestone,
    nextMilestone,
    progressPercent,
    normalizedNetWorth,
  }
}

export function WealthQuestPanel({ state, summary, onNavigate }: WealthQuestPanelProps) {
  const displayMode = state.settings.numberDisplayMode
  const assetCount = state.stocks.length + state.cash.length + state.cryptos.length + state.realEstate.length
  const hasAssets = assetCount > 0
  const hasLoans = state.loans.length > 0
  const isCashFlowPositive = summary.monthlyCashFlowTwd > 0
  const isDividendEngineActive = summary.monthlyEstimatedDividendTwd > 0
  const isRiskSafe = !hasLoans || summary.maintenanceStatus === 'safe'
  const wealthProgress = getWealthProgress(summary.netWorthTwd)
  const missions: WealthMission[] = [
    {
      title: '建立資產基地',
      description: hasAssets ? `${assetCount} 筆資產已登錄` : '前往資產頁建立第一筆資料',
      icon: WalletCards,
      isComplete: hasAssets,
      page: 'assets',
    },
    {
      title: '啟動股息引擎',
      description: isDividendEngineActive ? `每月 ${formatTwd(summary.monthlyEstimatedDividendTwd, displayMode)}` : '建立有配息的投資資產',
      icon: Zap,
      isComplete: isDividendEngineActive,
      page: 'assets',
    },
    {
      title: '讓現金流轉正',
      description: isCashFlowPositive ? `${formatCurrencyWithSign(summary.monthlyCashFlowTwd, displayMode)}／月` : '設定收入與支出，找出改善空間',
      icon: CircleDollarSign,
      isComplete: isCashFlowPositive,
      page: 'cashflow',
    },
    {
      title: '守住風險邊界',
      description: !hasLoans ? '目前沒有質押借款' : summary.maintenanceStatus === 'safe' ? '維持率在安全區' : '前往檢查質押風險',
      icon: ShieldCheck,
      isComplete: isRiskSafe,
      page: 'simulation',
    },
  ]
  const completedMissions = missions.filter((mission) => mission.isComplete).length

  return (
    <section className="wealth-quest-panel" aria-label="財富成長任務">
      <div className="wealth-quest-orbit wealth-quest-orbit-one" />
      <div className="wealth-quest-orbit wealth-quest-orbit-two" />
      <div className="wealth-quest-header">
        <div className="wealth-quest-brand">
          <span className="wealth-quest-icon"><Sparkles size={20} /></span>
          <div>
            <div className="wealth-quest-kicker">WEALTH QUEST · 成長系統</div>
            <h2>財富任務中心</h2>
          </div>
        </div>
        <div className="wealth-level-badge" aria-label={`財富等級 ${wealthProgress.level}`}>
          <span>LV</span>
          <strong>{String(wealthProgress.level).padStart(2, '0')}</strong>
        </div>
      </div>

      <div className="wealth-quest-grid">
        <div className="wealth-level-main">
          <div className="wealth-level-label">目前稱號</div>
          <h3>{wealthProgress.title}</h3>
          <p>下一個里程碑：<strong>{formatTwd(wealthProgress.nextMilestone, displayMode)}</strong></p>
          <div className="wealth-progress-meta">
            <span>{formatTwd(wealthProgress.normalizedNetWorth, displayMode)}</span>
            <strong>{Math.round(wealthProgress.progressPercent)}%</strong>
          </div>
          <div className="wealth-progress-track" role="progressbar" aria-label="目前財富里程碑進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(wealthProgress.progressPercent)}>
            <span style={{ width: `${wealthProgress.progressPercent}%` }} />
          </div>
          <div className="wealth-milestone-row"><span>本階段起點 {formatTwd(wealthProgress.currentMilestone, displayMode)}</span><span>持續累積，下一階段會解鎖</span></div>
        </div>

        <div className="wealth-missions">
          <div className="wealth-missions-header"><span>成長任務</span><strong>{completedMissions}/{missions.length} 已完成</strong></div>
          <div className="wealth-mission-list">
            {missions.map((mission) => {
              const MissionIcon = mission.icon
              return (
                <button type="button" className={`wealth-mission ${mission.isComplete ? 'is-complete' : ''}`} key={mission.title} onClick={() => onNavigate(mission.page)}>
                  <span className="wealth-mission-icon"><MissionIcon size={15} /></span>
                  <span className="wealth-mission-main"><strong>{mission.title}</strong><small>{mission.description}</small></span>
                  <span className="wealth-mission-state">{mission.isComplete ? <CheckCircle2 size={16} /> : <ChevronRight size={16} />}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
