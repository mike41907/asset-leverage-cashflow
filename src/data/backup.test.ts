import { describe, expect, it } from 'vitest'
import { createDemoState } from './demoData'
import { backupToAppState, createBackupData, mergeBackupIntoAppState, parseBackupData, serializeBackupData } from './backup'

describe('backup data', () => {
  it('serializes and parses a complete local app state', () => {
    const state = createDemoState()
    const backup = createBackupData(state, '2026-08-21T00:00:00.000Z')
    const parsed = parseBackupData(serializeBackupData(backup))

    expect(parsed.backupVersion).toBe(3)
    expect(parsed.exportedAt).toBe('2026-08-21T00:00:00.000Z')
    expect(parsed.stocks.map((stock) => stock.symbol)).toEqual(['0050', '00878'])
    expect(parsed.realEstate).toEqual([])
    expect(parsed.cryptos).toEqual([])
    expect(parsed.liabilities).toEqual([])
    expect(parsed.settings.themeMode).toBe('system')
  })

  it('imports V1 backups without the new household records', () => {
    const state = createDemoState()
    const backup = createBackupData(state)
    const legacyBackup = { ...backup, backupVersion: 1, cryptos: undefined, realEstate: undefined, liabilities: undefined }
    const parsed = parseBackupData(JSON.stringify(legacyBackup))

    expect(parsed.realEstate).toEqual([])
    expect(parsed.liabilities).toEqual([])
    expect(parsed.settings.schemaVersion).toBe(3)
  })

  it('rejects malformed and future-version backups', () => {
    expect(() => parseBackupData('{"backupVersion":1}')).toThrow('exportedAt')
    expect(() => parseBackupData(JSON.stringify({ ...createBackupData(createDemoState()), backupVersion: 99 }))).toThrow('不相容')
    expect(() => parseBackupData(JSON.stringify({ ...createBackupData(createDemoState()), stocks: [{ symbol: '0050' }] }))).toThrow('有效 ID')
  })

  it('replaces the current state with the backup state', () => {
    const state = createDemoState()
    const backup = createBackupData({ ...state, stocks: [state.stocks[0]], cash: [] })
    const replaced = backupToAppState(backup)

    expect(replaced.stocks).toHaveLength(1)
    expect(replaced.cash).toHaveLength(0)
    expect(replaced.settings).toEqual(state.settings)
  })

  it('merges by ID and lets the backup win on conflicts', () => {
    const state = createDemoState()
    const backup = createBackupData({
      ...state,
      stocks: [{ ...state.stocks[0], currentPrice: 210 }, {
        ...state.stocks[1],
        id: 'imported-stock',
        symbol: '00919',
      }],
    })
    const merged = mergeBackupIntoAppState(state, backup)

    expect(merged.stocks).toHaveLength(3)
    expect(merged.stocks.find((stock) => stock.id === state.stocks[0].id)?.currentPrice).toBe(210)
    expect(merged.stocks.some((stock) => stock.id === 'imported-stock')).toBe(true)
  })
})
