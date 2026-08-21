import { createDemoState } from './demoData'
import {
  deleteFromStore,
  getAllFromStore,
  getFromStore,
  putInStore,
  replaceStores,
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
  type Liability,
  type Loan,
  type RealEstateAsset,
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
    ...state.realEstate.map((item) => putInStore(STORE_NAMES.realEstate, item)),
    ...state.loans.map((item) => putInStore(STORE_NAMES.loans, item)),
    ...state.liabilities.map((item) => putInStore(STORE_NAMES.liabilities, item)),
    ...state.collaterals.map((item) => putInStore(STORE_NAMES.collaterals, item)),
    ...state.cashFlowItems.map((item) => putInStore(STORE_NAMES.cashFlowItems, item)),
    ...state.simulations.map((item) => putInStore(STORE_NAMES.simulations, item)),
    ...state.dividendTargets.map((item) => putInStore(STORE_NAMES.dividendTargets, item)),
    putInStore(STORE_NAMES.settings, state.settings),
  ])
}

export async function replaceAppState(state: AppState): Promise<void> {
  await replaceStores({
    [STORE_NAMES.stocks]: state.stocks,
    [STORE_NAMES.cash]: state.cash,
    [STORE_NAMES.realEstate]: state.realEstate,
    [STORE_NAMES.loans]: state.loans,
    [STORE_NAMES.liabilities]: state.liabilities,
    [STORE_NAMES.collaterals]: state.collaterals,
    [STORE_NAMES.cashFlowItems]: state.cashFlowItems,
    [STORE_NAMES.simulations]: state.simulations,
    [STORE_NAMES.dividendTargets]: state.dividendTargets,
    [STORE_NAMES.settings]: [state.settings],
    [STORE_NAMES.metadata]: [{ id: DEMO_SEEDED_KEY, value: true } satisfies MetadataRecord],
  })
}

async function readState(): Promise<AppState> {
  const [stocks, cash, realEstate, loans, liabilities, collaterals, cashFlowItems, simulations, dividendTargets, settings] = await Promise.all([
    getAllFromStore<StockAsset>(STORE_NAMES.stocks),
    getAllFromStore<CashAsset>(STORE_NAMES.cash),
    getAllFromStore<RealEstateAsset>(STORE_NAMES.realEstate),
    getAllFromStore<Loan>(STORE_NAMES.loans),
    getAllFromStore<Liability>(STORE_NAMES.liabilities),
    getAllFromStore<Collateral>(STORE_NAMES.collaterals),
    getAllFromStore<CashFlowItem>(STORE_NAMES.cashFlowItems),
    getAllFromStore<Simulation>(STORE_NAMES.simulations),
    getAllFromStore<DividendTarget>(STORE_NAMES.dividendTargets),
    getFromStore<AppSettings>(STORE_NAMES.settings, 'app'),
  ])

  return {
    stocks,
    cash,
    realEstate,
    loans,
    liabilities,
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

export async function saveRealEstate(asset: RealEstateAsset): Promise<void> {
  await putInStore(STORE_NAMES.realEstate, asset)
}

export async function deleteRealEstate(id: string): Promise<void> {
  await deleteFromStore(STORE_NAMES.realEstate, id)
}

export async function saveLiability(liability: Liability): Promise<void> {
  await putInStore(STORE_NAMES.liabilities, liability)
}

export async function deleteLiability(id: string): Promise<void> {
  await deleteFromStore(STORE_NAMES.liabilities, id)
}

export async function saveCashFlowItem(item: CashFlowItem): Promise<void> {
  await putInStore(STORE_NAMES.cashFlowItems, item)
}

export async function deleteCashFlowItem(id: string): Promise<void> {
  await deleteFromStore(STORE_NAMES.cashFlowItems, id)
}

export async function saveDividendTarget(target: DividendTarget): Promise<void> {
  await putInStore(STORE_NAMES.dividendTargets, target)
}

export async function deleteDividendTarget(id: string): Promise<void> {
  await deleteFromStore(STORE_NAMES.dividendTargets, id)
}

export async function saveSimulation(simulation: Simulation): Promise<void> {
  await putInStore(STORE_NAMES.simulations, simulation)
}

export async function deleteSimulation(id: string): Promise<void> {
  await deleteFromStore(STORE_NAMES.simulations, id)
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await putInStore(STORE_NAMES.settings, { ...settings, updatedAt: now() })
}

export async function saveLoanBundle(
  loan: Loan,
  collaterals: Collateral[],
  removedCollateralIds: string[] = [],
): Promise<void> {
  await Promise.all([
    putInStore(STORE_NAMES.loans, loan),
    ...collaterals.map((collateral) => putInStore(STORE_NAMES.collaterals, collateral)),
    ...removedCollateralIds.map((id) => deleteFromStore(STORE_NAMES.collaterals, id)),
  ])
}

export async function deleteLoanBundle(loan: Loan): Promise<void> {
  await Promise.all([
    deleteFromStore(STORE_NAMES.loans, loan.id),
    ...loan.collateralIds.map((id) => deleteFromStore(STORE_NAMES.collaterals, id)),
  ])
}

export async function clearDemoData(state: AppState): Promise<AppState> {
  const demoStocks = state.stocks.filter((item) => item.isDemo)
  const demoCash = state.cash.filter((item) => item.isDemo)
  const demoRealEstate = state.realEstate.filter((item) => item.isDemo)
  await Promise.all([
    ...demoStocks.map((item) => deleteStock(item.id)),
    ...demoCash.map((item) => deleteCash(item.id)),
    ...demoRealEstate.map((item) => deleteRealEstate(item.id)),
  ])

  return {
    ...state,
    stocks: state.stocks.filter((item) => !item.isDemo),
    cash: state.cash.filter((item) => !item.isDemo),
    realEstate: state.realEstate.filter((item) => !item.isDemo),
    settings: { ...state.settings, hasSeenDemoNotice: true, updatedAt: now() },
  }
}
