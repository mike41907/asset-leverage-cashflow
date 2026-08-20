import { createDemoState } from './demoData'
import {
  deleteFromStore,
  getAllFromStore,
  getFromStore,
  putInStore,
  STORE_NAMES,
} from './database'
import {
  createDefaultSettings,
  type AppState,
  type AppSettings,
  type CashAsset,
  type Collateral,
  type CashFlowItem,
  type DividendTarget,
  type Loan,
  type Simulation,
  type StockAsset,
} from '../domain/models'

const DEMO_SEEDED_KEY = 'demo-seeded'

interface MetadataRecord {
  id: string
  value: boolean
}

function now(): string {
  return new Date().toISOString()
}

export async function saveAppState(state: AppState): Promise<void> {
  await Promise.all([
    ...state.stocks.map((item) => putInStore(STORE_NAMES.stocks, item)),
    ...state.cash.map((item) => putInStore(STORE_NAMES.cash, item)),
    ...state.loans.map((item) => putInStore(STORE_NAMES.loans, item)),
    ...state.collaterals.map((item) => putInStore(STORE_NAMES.collaterals, item)),
    ...state.cashFlowItems.map((item) => putInStore(STORE_NAMES.cashFlowItems, item)),
    ...state.simulations.map((item) => putInStore(STORE_NAMES.simulations, item)),
    ...state.dividendTargets.map((item) => putInStore(STORE_NAMES.dividendTargets, item)),
    putInStore(STORE_NAMES.settings, state.settings),
  ])
}

async function readState(): Promise<AppState> {
  const [stocks, cash, loans, collaterals, cashFlowItems, simulations, dividendTargets, settings] = await Promise.all([
    getAllFromStore<StockAsset>(STORE_NAMES.stocks),
    getAllFromStore<CashAsset>(STORE_NAMES.cash),
    getAllFromStore<Loan>(STORE_NAMES.loans),
    getAllFromStore<Collateral>(STORE_NAMES.collaterals),
    getAllFromStore<CashFlowItem>(STORE_NAMES.cashFlowItems),
    getAllFromStore<Simulation>(STORE_NAMES.simulations),
    getAllFromStore<DividendTarget>(STORE_NAMES.dividendTargets),
    getFromStore<AppSettings>(STORE_NAMES.settings, 'app'),
  ])

  return {
    stocks,
    cash,
    loans,
    collaterals,
    cashFlowItems,
    simulations,
    dividendTargets,
    settings: settings ?? createDefaultSettings(),
  }
}

export async function loadAppState(): Promise<AppState> {
  const seeded = await getFromStore<MetadataRecord>(STORE_NAMES.metadata, DEMO_SEEDED_KEY)
  if (!seeded?.value) {
    const demoState = createDemoState()
    await saveAppState(demoState)
    await putInStore(STORE_NAMES.metadata, { id: DEMO_SEEDED_KEY, value: true } satisfies MetadataRecord)
    return demoState
  }

  return readState()
}

export async function saveStock(stock: StockAsset): Promise<void> {
  await putInStore(STORE_NAMES.stocks, stock)
}

export async function deleteStock(id: string): Promise<void> {
  await deleteFromStore(STORE_NAMES.stocks, id)
}

export async function saveCash(cash: CashAsset): Promise<void> {
  await putInStore(STORE_NAMES.cash, cash)
}

export async function deleteCash(id: string): Promise<void> {
  await deleteFromStore(STORE_NAMES.cash, id)
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await putInStore(STORE_NAMES.settings, { ...settings, updatedAt: now() })
}

export async function clearDemoData(state: AppState): Promise<AppState> {
  const demoStocks = state.stocks.filter((item) => item.isDemo)
  const demoCash = state.cash.filter((item) => item.isDemo)
  await Promise.all([
    ...demoStocks.map((item) => deleteStock(item.id)),
    ...demoCash.map((item) => deleteCash(item.id)),
  ])

  return {
    ...state,
    stocks: state.stocks.filter((item) => !item.isDemo),
    cash: state.cash.filter((item) => !item.isDemo),
    settings: { ...state.settings, hasSeenDemoNotice: true, updatedAt: now() },
  }
}
