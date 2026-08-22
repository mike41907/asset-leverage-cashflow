import {
  CURRENT_SCHEMA_VERSION,
  type AppSettings,
  type AppState,
  type BackupData,
  type CashAsset,
  type CashFlowItem,
  type Collateral,
  type CryptoAsset,
  type DividendTarget,
  type Liability,
  type Loan,
  type PortfolioSnapshot,
  type RealEstateAsset,
  type Simulation,
  type StockAsset,
} from '../domain/models'

export type BackupImportMode = 'merge' | 'replace'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} 格式不正確。`)
  return value
}

function requireRecordArray(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必須是陣列。`)

  return value.map((item, index) => {
    const record = requireRecord(item, `${label} 第 ${index + 1} 筆`)
    if (typeof record.id !== 'string' || record.id.trim() === '') {
      throw new Error(`${label} 第 ${index + 1} 筆缺少有效 ID。`)
    }
    return record
  })
}

function optionalRecordArray(value: unknown, label: string): UnknownRecord[] {
  return value === undefined ? [] : requireRecordArray(value, label)
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} 必須是有效數字。`)
  return value
}

function validateSettings(value: unknown): AppSettings {
  const settings = requireRecord(value, 'settings')
  const schemaVersion = requireFiniteNumber(settings.schemaVersion, 'settings.schemaVersion')
  if (schemaVersion < 1 || schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`備份的設定版本 ${schemaVersion} 無法由目前版本匯入。`)
  }
  if (settings.id !== 'app') throw new Error('settings.id 必須是 app。')
  if (!['system', 'light', 'dark'].includes(settings.themeMode as string)) throw new Error('settings.themeMode 格式不正確。')
  if (!['exact', 'compact'].includes(settings.numberDisplayMode as string)) throw new Error('settings.numberDisplayMode 格式不正確。')
  if (settings.baseCurrency !== 'TWD') throw new Error('目前只支援 TWD 基準幣別。')

  const warningRatioPercent = requireFiniteNumber(settings.maintenanceWarningRatioPercent, '警戒維持率')
  const marginCallRatioPercent = requireFiniteNumber(settings.maintenanceMarginCallRatioPercent, '追繳維持率')
  if (warningRatioPercent < 0 || marginCallRatioPercent < 0 || warningRatioPercent < marginCallRatioPercent) {
    throw new Error('備份中的維持率門檻順序不正確。')
  }

  return {
    ...settings,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    maintenanceWarningRatioPercent: warningRatioPercent,
    maintenanceMarginCallRatioPercent: marginCallRatioPercent,
    hasSeenDemoNotice: Boolean(settings.hasSeenDemoNotice),
  } as AppSettings
}

function cloneRecords<T extends { id: string }>(records: readonly T[]): T[] {
  return records.map((record) => ({ ...record }))
}

export function createBackupData(state: AppState, exportedAt = new Date().toISOString()): BackupData {
  return {
    backupVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    stocks: cloneRecords(state.stocks),
    cash: cloneRecords(state.cash),
    cryptos: cloneRecords(state.cryptos),
    realEstate: cloneRecords(state.realEstate),
    loans: cloneRecords(state.loans),
    liabilities: cloneRecords(state.liabilities),
    collaterals: cloneRecords(state.collaterals),
    cashFlowItems: cloneRecords(state.cashFlowItems),
    simulations: cloneRecords(state.simulations),
    dividendTargets: cloneRecords(state.dividendTargets),
    portfolioSnapshots: cloneRecords(state.portfolioSnapshots),
    settings: { ...state.settings },
  }
}

export function serializeBackupData(backup: BackupData): string {
  return JSON.stringify(backup, null, 2)
}

export function parseBackupData(serialized: string): BackupData {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch {
    throw new Error('這不是有效的 JSON 備份檔。')
  }

  const backup = requireRecord(parsed, '備份檔')
  const backupVersion = requireFiniteNumber(backup.backupVersion, 'backupVersion')
  if (!Number.isInteger(backupVersion) || backupVersion < 1 || backupVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`備份版本 ${backupVersion} 與目前 APP 不相容。`)
  }
  if (typeof backup.exportedAt !== 'string' || backup.exportedAt.trim() === '' || Number.isNaN(Date.parse(backup.exportedAt))) throw new Error('備份缺少有效的 exportedAt。')

  return {
    backupVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: backup.exportedAt,
    stocks: requireRecordArray(backup.stocks, 'stocks') as unknown as StockAsset[],
    cash: requireRecordArray(backup.cash, 'cash') as unknown as CashAsset[],
    cryptos: optionalRecordArray(backup.cryptos, 'cryptos') as unknown as CryptoAsset[],
    realEstate: optionalRecordArray(backup.realEstate, 'realEstate') as unknown as RealEstateAsset[],
    loans: requireRecordArray(backup.loans, 'loans') as unknown as Loan[],
    liabilities: optionalRecordArray(backup.liabilities, 'liabilities') as unknown as Liability[],
    collaterals: requireRecordArray(backup.collaterals, 'collaterals') as unknown as Collateral[],
    cashFlowItems: requireRecordArray(backup.cashFlowItems, 'cashFlowItems') as unknown as CashFlowItem[],
    simulations: requireRecordArray(backup.simulations, 'simulations') as unknown as Simulation[],
    dividendTargets: requireRecordArray(backup.dividendTargets, 'dividendTargets') as unknown as DividendTarget[],
    portfolioSnapshots: optionalRecordArray(backup.portfolioSnapshots, 'portfolioSnapshots') as unknown as PortfolioSnapshot[],
    settings: validateSettings(backup.settings),
  }
}

export function backupToAppState(backup: BackupData): AppState {
  return {
    stocks: cloneRecords(backup.stocks),
    cash: cloneRecords(backup.cash),
    cryptos: cloneRecords(backup.cryptos),
    realEstate: cloneRecords(backup.realEstate),
    loans: cloneRecords(backup.loans),
    liabilities: cloneRecords(backup.liabilities),
    collaterals: cloneRecords(backup.collaterals),
    cashFlowItems: cloneRecords(backup.cashFlowItems),
    simulations: cloneRecords(backup.simulations),
    dividendTargets: cloneRecords(backup.dividendTargets),
    portfolioSnapshots: cloneRecords(backup.portfolioSnapshots),
    settings: { ...backup.settings, schemaVersion: CURRENT_SCHEMA_VERSION },
  }
}

function mergeRecords<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const merged = new Map(current.map((record) => [record.id, { ...record }]))
  incoming.forEach((record) => merged.set(record.id, { ...record }))
  return [...merged.values()]
}

export function mergeBackupIntoAppState(current: AppState, backup: BackupData): AppState {
  return {
    stocks: mergeRecords(current.stocks, backup.stocks),
    cash: mergeRecords(current.cash, backup.cash),
    cryptos: mergeRecords(current.cryptos, backup.cryptos),
    realEstate: mergeRecords(current.realEstate, backup.realEstate),
    loans: mergeRecords(current.loans, backup.loans),
    liabilities: mergeRecords(current.liabilities, backup.liabilities),
    collaterals: mergeRecords(current.collaterals, backup.collaterals),
    cashFlowItems: mergeRecords(current.cashFlowItems, backup.cashFlowItems),
    simulations: mergeRecords(current.simulations, backup.simulations),
    dividendTargets: mergeRecords(current.dividendTargets, backup.dividendTargets),
    portfolioSnapshots: mergeRecords(current.portfolioSnapshots, backup.portfolioSnapshots),
    settings: { ...current.settings, ...backup.settings, schemaVersion: CURRENT_SCHEMA_VERSION },
  }
}
