import type { PortfolioSummary } from './calculations'
import type { PortfolioSnapshot } from './models'

export const PORTFOLIO_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000

export const PORTFOLIO_TREND_RANGES = [
  { days: 1, label: '1日' },
  { days: 7, label: '7日' },
  { days: 30, label: '30日' },
  { days: 180, label: '180日' },
  { days: 365, label: '365日' },
] as const

export type PortfolioTrendRangeDays = (typeof PORTFOLIO_TREND_RANGES)[number]['days']

export function createPortfolioSnapshot(
  summary: Pick<PortfolioSummary, 'totalAssetsTwd' | 'totalLiabilitiesTwd' | 'netWorthTwd'>,
  recordedAt = new Date().toISOString(),
): PortfolioSnapshot {
  const timestamp = new Date(recordedAt).getTime()
  const bucketTimestamp = Number.isFinite(timestamp)
    ? Math.floor(timestamp / PORTFOLIO_SNAPSHOT_INTERVAL_MS) * PORTFOLIO_SNAPSHOT_INTERVAL_MS
    : Date.now()

  return {
    id: `portfolio-${new Date(bucketTimestamp).toISOString()}`,
    recordedAt,
    totalAssetsTwd: summary.totalAssetsTwd,
    totalLiabilitiesTwd: summary.totalLiabilitiesTwd,
    netWorthTwd: summary.netWorthTwd,
  }
}

function snapshotTime(snapshot: PortfolioSnapshot): number {
  return Date.parse(snapshot.recordedAt)
}

export function selectPortfolioTrendSnapshots(
  snapshots: readonly PortfolioSnapshot[],
  rangeDays: PortfolioTrendRangeDays,
  now = new Date(),
): PortfolioSnapshot[] {
  const nowTimestamp = now.getTime()
  const cutoff = nowTimestamp - rangeDays * 24 * 60 * 60 * 1000
  const sorted = snapshots
    .filter((snapshot) => Number.isFinite(snapshotTime(snapshot)))
    .filter((snapshot) => snapshotTime(snapshot) <= nowTimestamp)
    .sort((left, right) => snapshotTime(left) - snapshotTime(right))
  const baseline = sorted.filter((snapshot) => snapshotTime(snapshot) < cutoff).at(-1)
  const visible = sorted.filter((snapshot) => snapshotTime(snapshot) >= cutoff)

  return baseline ? [baseline, ...visible] : visible
}

export interface PortfolioTrendChange {
  changeTwd: number
  changePercent: number | null
}

export function calculatePortfolioTrendChange(snapshots: readonly PortfolioSnapshot[]): PortfolioTrendChange | null {
  if (snapshots.length < 2) return null

  const firstValue = snapshots[0].totalAssetsTwd
  const lastValue = snapshots[snapshots.length - 1].totalAssetsTwd
  const changeTwd = lastValue - firstValue

  return {
    changeTwd,
    changePercent: firstValue > 0 ? (changeTwd / firstValue) * 100 : null,
  }
}
