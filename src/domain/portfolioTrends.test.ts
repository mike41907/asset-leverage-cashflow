import { describe, expect, it } from 'vitest'
import { calculatePortfolioTrendChange, createPortfolioSnapshot, selectPortfolioTrendSnapshots } from './portfolioTrends'
import type { PortfolioSnapshot } from './models'

function snapshot(id: string, recordedAt: string, totalAssetsTwd: number): PortfolioSnapshot {
  return { id, recordedAt, totalAssetsTwd, totalLiabilitiesTwd: 0, netWorthTwd: totalAssetsTwd }
}

describe('portfolio trends', () => {
  it('buckets snapshots into 15-minute local history records', () => {
    const created = createPortfolioSnapshot({ totalAssetsTwd: 100, totalLiabilitiesTwd: 20, netWorthTwd: 80 }, '2026-08-22T10:07:30.000Z')

    expect(created.id).toBe('portfolio-2026-08-22T10:00:00.000Z')
    expect(created.totalAssetsTwd).toBe(100)
  })

  it('keeps the last point before the selected range as a baseline', () => {
    const points = selectPortfolioTrendSnapshots([
      snapshot('before', '2026-08-15T00:00:00.000Z', 100),
      snapshot('middle', '2026-08-18T00:00:00.000Z', 110),
      snapshot('latest', '2026-08-22T00:00:00.000Z', 120),
    ], 7, new Date('2026-08-22T12:00:00.000Z'))

    expect(points.map((point) => point.id)).toEqual(['before', 'middle', 'latest'])
    expect(calculatePortfolioTrendChange(points)).toEqual({ changeTwd: 20, changePercent: 20 })
  })

  it('does not report a change before two historical points exist', () => {
    expect(calculatePortfolioTrendChange([snapshot('only', '2026-08-22T00:00:00.000Z', 100)])).toBeNull()
  })
})
