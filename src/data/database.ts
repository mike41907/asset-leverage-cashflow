export const DATABASE_NAME = 'asset-leverage-cashflow-app'
export const DATABASE_VERSION = 3

export const STORE_NAMES = {
  stocks: 'stocks',
  cash: 'cash',
  cryptos: 'cryptos',
  realEstate: 'realEstate',
  loans: 'loans',
  liabilities: 'liabilities',
  collaterals: 'collaterals',
  cashFlowItems: 'cashFlowItems',
  simulations: 'simulations',
  dividendTargets: 'dividendTargets',
  settings: 'settings',
  metadata: 'metadata',
} as const

export type StoreName = typeof STORE_NAMES[keyof typeof STORE_NAMES]

let databasePromise: Promise<IDBDatabase> | null = null

function createObjectStores(database: IDBDatabase): void {
  for (const storeName of Object.values(STORE_NAMES)) {
    if (!database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName, { keyPath: 'id' })
    }
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('此瀏覽器不支援 IndexedDB。'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => createObjectStores(request.result)
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error('無法開啟本機資料庫。'))
  })

  return databasePromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失敗。'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 交易失敗。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 交易已中止。'))
  })
}

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  return requestToPromise(transaction.objectStore(storeName).getAll())
}

export async function getFromStore<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  return requestToPromise(transaction.objectStore(storeName).get(key))
}

export async function putInStore<T extends object>(storeName: StoreName, value: T): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  await requestToPromise(transaction.objectStore(storeName).put(value))
}

export async function deleteFromStore(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  await requestToPromise(transaction.objectStore(storeName).delete(key))
}

export async function replaceStores(records: Partial<Record<StoreName, readonly object[]>>): Promise<void> {
  const storeNames = Object.keys(records) as StoreName[]
  if (storeNames.length === 0) return

  const database = await openDatabase()
  const transaction = database.transaction(storeNames, 'readwrite')

  for (const storeName of storeNames) {
    const objectStore = transaction.objectStore(storeName)
    objectStore.clear()
    for (const record of records[storeName] ?? []) objectStore.put(record)
  }

  await transactionToPromise(transaction)
}

export async function deleteDatabase(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise
    database.close()
  }
  databasePromise = null

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('無法清除本機資料庫。'))
    request.onblocked = () => reject(new Error('資料庫仍被其他分頁使用，請關閉其他分頁後再試。'))
  })
}
