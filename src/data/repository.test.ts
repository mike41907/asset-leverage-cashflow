import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from './database'
import { clearDemoData, loadAppState, saveStock } from './repository'

describe('local repository', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('seeds demo assets into IndexedDB only on first load', async () => {
    const first = await loadAppState()
    expect(first.stocks.map((item) => item.symbol)).toEqual(['0050', '00878'])
    expect(first.cash[0]?.amount).toBe(1_000_000)

    await saveStock({ ...first.stocks[0], symbol: '0050-EDITED', isDemo: false })
    const second = await loadAppState()
    expect(second.stocks.some((item) => item.symbol === '0050-EDITED')).toBe(true)
    expect(second.stocks).toHaveLength(2)
  })

  it('clears only records marked as demo data', async () => {
    const first = await loadAppState()
    await saveStock({ ...first.stocks[0], symbol: '0050-USER', isDemo: false })
    const updated = await loadAppState()
    const cleared = await clearDemoData(updated)

    expect(cleared.stocks.map((item) => item.symbol)).toEqual(['0050-USER'])
    expect(cleared.cash).toHaveLength(0)
  })
})
