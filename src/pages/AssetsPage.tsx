import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Banknote,
  Check,
  ChevronDown,
  CircleDollarSign,
  Coins,
  Edit3,
  House,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import type { CashAsset, Currency, CryptoAsset, Market, RealEstateAsset, RealEstateType, StockAsset, StockDividendPeriod } from '../domain/models'
import { calculateAnnualDividendTwd, calculateCashValue, calculateCryptoMarketValue, calculateCryptoUnrealizedGain, calculateCryptoUnrealizedGainPercent, calculateRealEstateValueTwd, calculateStockMarketValue, calculateStockUnrealizedGain, calculateStockUnrealizedGainPercent } from '../domain/calculations'
import { formatCurrencyWithSign, formatNumber, formatPercent, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'
import { EmptyState } from '../components/EmptyState'
import { HoldingsScreenshotImportModal, type HoldingImportStatus } from '../components/HoldingsScreenshotImportModal'
import { parseHoldingScreenshotText, recognizeHoldingImages, type HoldingImportCandidate, type OcrProgress } from '../services/holdingsImportService'
import { fetchStockQuote, fetchUsdTwdExchangeRate, hasChineseName, PUBLIC_QUOTE_PROVIDER_LABEL, type StockQuote, type UsdTwdExchangeRate } from '../services/quoteService'

interface AssetsPageProps {
  stocks: StockAsset[]
  cash: CashAsset[]
  cryptos: CryptoAsset[]
  realEstate: RealEstateAsset[]
  displayMode: 'exact' | 'compact'
  onSaveStock: (stock: StockAsset) => Promise<void>
  onSaveStocks: (stocks: StockAsset[]) => Promise<void>
  onDeleteStock: (id: string) => Promise<void>
  onSaveCash: (cash: CashAsset) => Promise<void>
  onDeleteCash: (id: string) => Promise<void>
  onSaveCrypto: (crypto: CryptoAsset) => Promise<void>
  onDeleteCrypto: (id: string) => Promise<void>
  onSaveRealEstate: (asset: RealEstateAsset) => Promise<void>
  onDeleteRealEstate: (id: string) => Promise<void>
}

type AssetTab = 'stocks' | 'cash' | 'crypto' | 'realEstate'
type StockSort = 'market-value' | 'dividend-yield' | 'annual-dividend' | 'gain-percent' | 'symbol'
type StockMarketFilter = Market | 'all'
type StockDraft = Omit<StockAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>
type CashDraft = Omit<CashAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>
type CryptoDraft = Omit<CryptoAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>
type RealEstateDraft = Omit<RealEstateAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>

const defaultStockDraft: StockDraft = {
  symbol: '',
  name: '',
  market: 'TW',
  currency: 'TWD',
  exchangeRateToTwd: 1,
  shares: 0,
  averageCost: 0,
  currentPrice: 0,
  currentPriceSource: 'manual',
  estimatedAnnualDividendPerShare: 0,
  estimatedYieldPercent: 0,
  dividendSource: 'manual',
  asCollateral: false,
  notes: '',
}

type QuoteStatus = 'idle' | 'loading' | 'success' | 'error'

interface QuoteState {
  status: QuoteStatus
  message: string
  quote: StockQuote | null
}

interface StockQuoteResult {
  quote: StockQuote
  exchangeRate: UsdTwdExchangeRate | null
}

const initialQuoteState: QuoteState = {
  status: 'idle',
  message: '輸入代號後離開欄位，會自動查詢行情與中文名稱；批次更新請使用頁面上方按鈕。',
  quote: null,
}

const defaultCashDraft: CashDraft = {
  label: '',
  currency: 'TWD',
  amount: 0,
  exchangeRateToTwd: 1,
  notes: '',
}

const defaultCryptoDraft: CryptoDraft = {
  symbol: '',
  name: '',
  platform: '',
  currency: 'USD',
  exchangeRateToTwd: 1,
  quantity: 0,
  averageCost: 0,
  currentPrice: 0,
  notes: '',
}

const defaultRealEstateDraft: RealEstateDraft = {
  name: '',
  propertyType: 'residential',
  currentValueTwd: 0,
  purchasePriceTwd: 0,
  monthlyRentalIncomeTwd: 0,
  notes: '',
}

function stockDraftFrom(stock: StockAsset): StockDraft {
  const { id: _id, kind: _kind, createdAt: _createdAt, updatedAt: _updatedAt, isDemo: _isDemo, ...draft } = stock
  return draft
}

function cashDraftFrom(cash: CashAsset): CashDraft {
  const { id: _id, kind: _kind, createdAt: _createdAt, updatedAt: _updatedAt, isDemo: _isDemo, ...draft } = cash
  return draft
}

function cryptoDraftFrom(crypto: CryptoAsset): CryptoDraft {
  const { id: _id, kind: _kind, createdAt: _createdAt, updatedAt: _updatedAt, isDemo: _isDemo, ...draft } = crypto
  return draft
}

function realEstateDraftFrom(asset: RealEstateAsset): RealEstateDraft {
  const { id: _id, kind: _kind, createdAt: _createdAt, updatedAt: _updatedAt, isDemo: _isDemo, ...draft } = asset
  return draft
}

function realEstateTypeLabel(type: RealEstateType): string {
  return type === 'residential' ? '住宅' : type === 'commercial' ? '商用不動產' : type === 'land' ? '土地' : '其他房產'
}

function getQuoteErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '公開行情查詢失敗，請手動輸入價格。'
}

function formatQuoteTime(value: string | null | undefined): string {
  if (!value) return '時間未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '時間未知'
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function priceSourceLabel(stock: StockAsset): string {
  if (stock.currentPriceSource === 'yahoo-public') return `自動 · ${formatQuoteTime(stock.currentPriceMarketAt ?? stock.currentPriceFetchedAt)}`
  return '手動價格'
}

function preferredStockName(currentName: string, quoteName: string): string {
  const current = currentName.trim()
  const incoming = quoteName.trim()
  if (!current) return incoming
  if (!hasChineseName(current) && hasChineseName(incoming)) return incoming
  return current
}

function dividendPeriodLabel(period: StockDividendPeriod | undefined): string {
  return period === 'trailing-12-months' ? '近 12 個月' : period === 'previous-calendar-year' ? '前一完整年度' : '手動估算'
}

function dividendAgeDays(fetchedAt: string | undefined): number | null {
  if (!fetchedAt) return null
  const timestamp = new Date(fetchedAt).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
}

function dividendStatusLabel(stock: StockAsset): string {
  if (!hasDividendEstimate(stock)) return '待補資料'
  if (stock.dividendSource !== 'yahoo-public') return '手動輸入'
  const ageDays = dividendAgeDays(stock.dividendFetchedAt)
  if (ageDays === null || ageDays === 0) return '自動 · 今日更新'
  return ageDays <= 7 ? `自動 · ${ageDays} 天前` : `資料較舊 · ${ageDays} 天前`
}

function dividendStatusClass(stock: StockAsset): string {
  if (!hasDividendEstimate(stock)) return 'dividend-status-missing'
  if (stock.dividendSource !== 'yahoo-public') return 'dividend-status-manual'
  return (dividendAgeDays(stock.dividendFetchedAt) ?? 0) > 7 ? 'dividend-status-stale' : 'dividend-status-auto'
}

function dividendDataDescription(stock: StockAsset): string {
  if (!hasDividendEstimate(stock)) return '公開資料目前沒有可計算的配息事件，請用券商資料補填。'
  if (stock.dividendSource !== 'yahoo-public') return '這筆數字是手動輸入的現金流假設，並非公開配息事件。'
  return stock.dividendFetchedAt ? `公開資料更新於 ${formatQuoteTime(stock.dividendFetchedAt)}。` : '已由公開行情來源帶入。'
}

function dividendPeriodRange(stock: StockAsset): string {
  if (stock.dividendPeriodStart && stock.dividendPeriodEnd) return `${stock.dividendPeriodStart}～${stock.dividendPeriodEnd}`
  return stock.dividendPeriod ? '公開資料未提供日期區間' : '尚未建立配息期間'
}

function costYieldPercent(stock: StockAsset): number | null {
  if (stock.averageCost <= 0 || stock.estimatedAnnualDividendPerShare <= 0) return null
  return stock.estimatedAnnualDividendPerShare / stock.averageCost * 100
}

function dividendCurrency(stock: Pick<StockAsset, 'currency'>): string {
  return stock.currency === 'USD' ? '$' : 'NT$'
}

function assetCurrency(currency: Currency): string {
  return currency === 'USD' ? '$' : 'NT$'
}

function quoteDividendFields(quote: StockQuote, current?: Pick<StockDraft, 'estimatedAnnualDividendPerShare' | 'dividendSource'>): Partial<Pick<StockDraft, 'estimatedAnnualDividendPerShare' | 'estimatedYieldPercent' | 'dividendSource' | 'dividendFetchedAt' | 'dividendPeriod' | 'dividendPeriodStart' | 'dividendPeriodEnd'>> {
  if (!quote.dividend) {
    return current?.dividendSource === 'yahoo-public' && current.estimatedAnnualDividendPerShare > 0 && quote.price > 0
      ? { estimatedYieldPercent: current.estimatedAnnualDividendPerShare / quote.price * 100 }
      : {}
  }
  return {
    estimatedAnnualDividendPerShare: quote.dividend.annualDividendPerShare,
    estimatedYieldPercent: quote.price > 0 ? quote.dividend.annualDividendPerShare / quote.price * 100 : 0,
    dividendSource: 'yahoo-public',
    dividendFetchedAt: quote.fetchedAt,
    dividendPeriod: quote.dividend.period,
    dividendPeriodStart: quote.dividend.periodStart,
    dividendPeriodEnd: quote.dividend.periodEnd,
  }
}

function hasDividendEstimate(value: Pick<StockDraft, 'estimatedAnnualDividendPerShare' | 'estimatedYieldPercent'>): boolean {
  return value.estimatedAnnualDividendPerShare > 0 || value.estimatedYieldPercent > 0
}

function needsDividendRefreshForDraft(value: Pick<StockDraft, 'estimatedAnnualDividendPerShare' | 'estimatedYieldPercent' | 'dividendSource'>): boolean {
  if (value.dividendSource !== 'yahoo-public' && hasDividendEstimate(value)) return false
  return value.estimatedAnnualDividendPerShare <= 0 || value.estimatedYieldPercent <= 0
}

function needsAutomaticDividendRefresh(stock: StockAsset): boolean {
  return !stock.isDemo && stock.market !== 'OTHER' && needsDividendRefreshForDraft(stock)
}

async function fetchStockQuoteResult(symbol: string, market: Market): Promise<StockQuoteResult> {
  const [quote, exchangeRate] = await Promise.all([
    fetchStockQuote(symbol, market),
    market === 'US' ? fetchUsdTwdExchangeRate() : Promise.resolve(null),
  ])
  return { quote, exchangeRate }
}

interface QuoteBatchResult {
  updatedStocks: StockAsset[]
  failedStocks: Array<{ symbol: string; error: string }>
  noDividendSymbols: string[]
}

async function refreshStockQuotesSequentially(stocks: StockAsset[], onProgress: (completed: number) => void): Promise<QuoteBatchResult> {
  const exchangeRate = stocks.some((stock) => stock.market === 'US')
    ? await fetchUsdTwdExchangeRate().catch(() => null)
    : null
  const updatedStocks: StockAsset[] = []
  const failedStocks: Array<{ symbol: string; error: string }> = []
  const noDividendSymbols: string[] = []

  for (const [index, stock] of stocks.entries()) {
    try {
      const quote = await fetchStockQuote(stock.symbol, stock.market)
      updatedStocks.push(applyQuoteToStock(stock, quote, exchangeRate))
      if (!quote.dividend) noDividendSymbols.push(stock.symbol)
    } catch (error) {
      failedStocks.push({ symbol: stock.symbol, error: getQuoteErrorMessage(error) })
    } finally {
      onProgress(index + 1)
    }
  }

  return { updatedStocks, failedStocks, noDividendSymbols }
}

function formatQuoteFailureSummary(failedStocks: Array<{ symbol: string; error: string }>): string {
  if (failedStocks.length === 0) return ''
  const rateLimited = failedStocks.filter((item) => item.error.includes('HTTP 429'))
  const otherFailures = failedStocks.filter((item) => !item.error.includes('HTTP 429'))
  const formatSymbols = (items: Array<{ symbol: string }>) => {
    const symbols = items.map((item) => item.symbol).slice(0, 6).join('、')
    return items.length > 6 ? `${symbols} 等` : symbols
  }
  const messages: string[] = []
  if (rateLimited.length > 0) messages.push(`${rateLimited.length} 筆被公開行情服務限流（HTTP 429）：${formatSymbols(rateLimited)}。請等待約 1 分鐘後再更新。`)
  if (otherFailures.length > 0) messages.push(`${otherFailures.length} 筆查詢失敗：${formatSymbols(otherFailures)}。${otherFailures[0].error}`)
  return messages.join(' ')
}

function applyQuoteToStock(stock: StockAsset, quote: StockQuote, exchangeRate: UsdTwdExchangeRate | null): StockAsset {
  return {
    ...stock,
    currentPrice: quote.price,
    currentPriceSource: 'yahoo-public',
    currentPriceFetchedAt: quote.fetchedAt,
    currentPriceMarketAt: quote.marketAt ?? undefined,
    name: preferredStockName(stock.name, quote.name),
    currency: quote.currency,
    exchangeRateToTwd: quote.currency === 'TWD' ? 1 : exchangeRate?.rate ?? stock.exchangeRateToTwd,
    ...quoteDividendFields(quote, stock),
    updatedAt: new Date().toISOString(),
  }
}

function StockMobileCard({ stock, displayMode, onEdit, onDelete, onDividendDetail }: { stock: StockAsset; displayMode: 'exact' | 'compact'; onEdit: () => void; onDelete: () => void; onDividendDetail: () => void }) {
  const gain = calculateStockUnrealizedGain(stock)
  const gainPercent = calculateStockUnrealizedGainPercent(stock)
  const isPositive = gain >= 0

  return (
    <article className="stock-mobile-card">
      <div className="stock-mobile-card-header">
        <div className="asset-cell"><span className="asset-avatar">{stock.symbol.slice(0, 2)}</span><div><strong>{stock.symbol}</strong><small>{stock.name}</small></div>{stock.isDemo && <span className="demo-badge">Demo</span>}</div>
        <div className="stock-mobile-card-actions"><button type="button" className="icon-button small" aria-label={`查看 ${stock.symbol} 配息詳情`} title="配息詳情" onClick={onDividendDetail}><CircleDollarSign size={17} /></button><button type="button" className="icon-button small" aria-label={`編輯 ${stock.symbol}`} title="編輯" onClick={onEdit}><Edit3 size={17} /></button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${stock.symbol}`} title="刪除" onClick={onDelete}><Trash2 size={17} /></button></div>
      </div>
      <div className="stock-mobile-card-main">
        <div className="stock-mobile-card-holding"><span>持有 {formatNumber(stock.shares)}</span><small>{stock.averageCost > 0 ? `成本 ${stock.currency === 'USD' ? '$' : 'NT$'}${formatNumber(stock.averageCost, 2)}` : '成本待補'}</small></div>
        <div className="stock-mobile-card-value"><span>市值</span><strong>{formatTwd(calculateStockMarketValue(stock), displayMode)}</strong><small>現價 {stock.currency === 'USD' ? '$' : 'NT$'}{formatNumber(stock.currentPrice, 2)}</small>{stock.currency === 'USD' && <small className="exchange-rate-note">匯率 {formatNumber(stock.exchangeRateToTwd, 4)} TWD/USD</small>}</div>
      </div>
      <div className="stock-mobile-card-footer"><span className={isPositive ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(gain, displayMode)} <small>{formatPercent(gainPercent)}</small></span><span className={`quote-source ${stock.currentPriceSource === 'yahoo-public' ? 'quote-source-live' : ''}`}>{stock.currentPriceSource === 'yahoo-public' && <span className="live-dot" />}{priceSourceLabel(stock)}</span><span className="stock-mobile-card-dividend">年配息 {dividendCurrency(stock)}{formatNumber(stock.estimatedAnnualDividendPerShare, 2)} · 殖利率 {formatPercent(stock.estimatedYieldPercent)}<small>{dividendPeriodLabel(stock.dividendPeriod)} · {dividendStatusLabel(stock)}</small></span><span className="stock-mobile-card-collateral">質押擔保 {stock.asCollateral ? '是' : '否'}</span></div>
    </article>
  )
}

function FormField({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`form-field ${wide ? 'form-field-wide' : ''}`}><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const firstFocusable = dialog.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([aria-label="關閉視窗"])')
    firstFocusable?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="asset-modal-title">
        <div className="modal-header">
          <div><div className="section-kicker">資產資料</div><h2 id="asset-modal-title">{title}</h2><p>{description}</p></div>
          <button type="button" className="icon-button" aria-label="關閉視窗" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function DividendDetailModal({ stock, displayMode, onClose }: { stock: StockAsset; displayMode: 'exact' | 'compact'; onClose: () => void }) {
  const costYield = costYieldPercent(stock)
  const statusLabel = dividendStatusLabel(stock)
  const statusClass = dividendStatusClass(stock)

  return (
    <Modal title={`${stock.symbol} 配息詳情`} description={`${stock.name || stock.symbol} · ${stock.market === 'TW' ? '台股' : stock.market === 'US' ? '美股' : '其他市場'}`} onClose={onClose}>
      <div className="dividend-detail-summary"><span className="dividend-detail-icon"><CircleDollarSign size={22} /></span><div><strong>{dividendStatusLabel(stock)}</strong><span>{dividendDataDescription(stock)}</span></div><span className={`dividend-status-pill ${statusClass}`}>{statusLabel}</span></div>
      <div className="dividend-detail-grid">
        <div><span>每股年配息</span><strong>{dividendCurrency(stock)}{formatNumber(stock.estimatedAnnualDividendPerShare, 2)}</strong><small>{stock.dividendPeriod ? dividendPeriodLabel(stock.dividendPeriod) : '尚未建立期間'}</small></div>
        <div><span>現價殖利率</span><strong>{formatPercent(stock.estimatedYieldPercent)}</strong><small>以目前價格計算</small></div>
        <div><span>成本殖利率</span><strong>{formatPercent(costYield)}</strong><small>{costYield === null ? '需要平均成本與配息' : '以平均成本計算'}</small></div>
        <div><span>預估年度股息</span><strong>{formatTwd(calculateAnnualDividendTwd(stock), displayMode)}</strong><small>持有 {formatNumber(stock.shares)} 股</small></div>
      </div>
      <div className={`dividend-detail-status ${statusClass}`}><Info size={15} /><div><strong>資料期間：{dividendPeriodRange(stock)}</strong><span>{dividendDataDescription(stock)}</span></div></div>
      <p className="dividend-detail-note">這裡的年化殖利率是依目前價格與已取得的配息現金流估算，不代表未來保證報酬，也不包含股價漲跌。</p>
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>關閉</button></div>
    </Modal>
  )
}

function SelectChevron() {
  return <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
}

export function AssetsPage({ stocks, cash, cryptos, realEstate, displayMode, onSaveStock, onSaveStocks, onDeleteStock, onSaveCash, onDeleteCash, onSaveCrypto, onDeleteCrypto, onSaveRealEstate, onDeleteRealEstate }: AssetsPageProps) {
  const [activeTab, setActiveTab] = useState<AssetTab>('stocks')
  const [search, setSearch] = useState('')
  const [stockMarketFilter, setStockMarketFilter] = useState<StockMarketFilter>('all')
  const [stockSort, setStockSort] = useState<StockSort>('market-value')
  const [onlyCollateral, setOnlyCollateral] = useState(false)
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [cashModalOpen, setCashModalOpen] = useState(false)
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false)
  const [realEstateModalOpen, setRealEstateModalOpen] = useState(false)
  const [editingStock, setEditingStock] = useState<StockAsset | null>(null)
  const [editingCash, setEditingCash] = useState<CashAsset | null>(null)
  const [editingCrypto, setEditingCrypto] = useState<CryptoAsset | null>(null)
  const [editingRealEstate, setEditingRealEstate] = useState<RealEstateAsset | null>(null)
  const [stockDraft, setStockDraft] = useState<StockDraft>(defaultStockDraft)
  const [cashDraft, setCashDraft] = useState<CashDraft>(defaultCashDraft)
  const [cryptoDraft, setCryptoDraft] = useState<CryptoDraft>(defaultCryptoDraft)
  const [realEstateDraft, setRealEstateDraft] = useState<RealEstateDraft>(defaultRealEstateDraft)
  const [cryptoFormNotice, setCryptoFormNotice] = useState<string | null>(null)
  const [quoteState, setQuoteState] = useState<QuoteState>(initialQuoteState)
  const [dividendDetailStock, setDividendDetailStock] = useState<StockAsset | null>(null)
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState<{ completed: number; total: number } | null>(null)
  const [quoteListNotice, setQuoteListNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [isAssetSaving, setIsAssetSaving] = useState(false)
  const [holdingsImportModalOpen, setHoldingsImportModalOpen] = useState(false)
  const [holdingsImportStatus, setHoldingsImportStatus] = useState<HoldingImportStatus>('error')
  const [holdingsImportMessage, setHoldingsImportMessage] = useState('')
  const [holdingsImportProgress, setHoldingsImportProgress] = useState<OcrProgress | null>(null)
  const [holdingsImportCandidates, setHoldingsImportCandidates] = useState<HoldingImportCandidate[]>([])
  const [isHoldingsImportSaving, setIsHoldingsImportSaving] = useState(false)
  const holdingsImportInputRef = useRef<HTMLInputElement>(null)
  const quoteRequestId = useRef(0)
  const dividendRefreshAttempted = useRef(new Set<string>())
  const dividendRefreshInFlight = useRef<Promise<void> | null>(null)
  const quoteRefreshRunning = useRef(false)
  const isMounted = useRef(false)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (dividendRefreshInFlight.current || quoteRefreshRunning.current) return
    const candidates = stocks.filter(needsAutomaticDividendRefresh).filter((stock) => {
      const key = `${stock.id}:${stock.market}:${stock.symbol.trim().toUpperCase()}`
      if (dividendRefreshAttempted.current.has(key)) return false
      dividendRefreshAttempted.current.add(key)
      return true
    })
    if (candidates.length === 0) return

    setQuoteListNotice({ kind: 'success', message: `正在自動更新 ${candidates.map((stock) => stock.symbol).join('、')} 的行情、配息與殖利率…` })
    setIsRefreshingAll(true)
    setRefreshProgress({ completed: 0, total: candidates.length })
    quoteRefreshRunning.current = true
    const run = (async () => {
      try {
        const { updatedStocks, failedStocks, noDividendSymbols } = await refreshStockQuotesSequentially(candidates, (completed) => {
          setRefreshProgress((current) => current ? { ...current, completed } : current)
        })
        if (!isMounted.current) return
        if (updatedStocks.length > 0) await onSaveStocks(updatedStocks)
        if (!isMounted.current) return
        const updatedMessage = updatedStocks.length > 0 ? `已自動補抓 ${updatedStocks.length} 筆行情、年配息與年化殖利率。` : '行情已查詢，但公開資料尚未提供可計算的配息事件。'
        const failures = formatQuoteFailureSummary(failedStocks)
        const missing = noDividendSymbols.length > 0 ? `無配息事件：${noDividendSymbols.join('、')}，可手動輸入殖利率。` : ''
        setQuoteListNotice({ kind: failedStocks.length > 0 ? 'error' : 'success', message: [updatedMessage, failures, missing].filter(Boolean).join(' ') })
      } catch (error) {
        if (isMounted.current) setQuoteListNotice({ kind: 'error', message: `自動補抓配息失敗：${getQuoteErrorMessage(error)}` })
      }
      finally {
        if (isMounted.current) {
          setIsRefreshingAll(false)
          setRefreshProgress(null)
        }
        quoteRefreshRunning.current = false
      }
    })()
    dividendRefreshInFlight.current = run
    void run.finally(() => {
      if (dividendRefreshInFlight.current === run) dividendRefreshInFlight.current = null
    })
  }, [onSaveStocks, stocks])

  const filteredStocks = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matchingStocks = stocks.filter((stock) => {
      const matchesSearch = `${stock.symbol} ${stock.name}`.toLowerCase().includes(query)
      const matchesMarket = stockMarketFilter === 'all' || stock.market === stockMarketFilter
      const matchesCollateral = !onlyCollateral || stock.asCollateral
      return matchesSearch && matchesMarket && matchesCollateral
    })

    return [...matchingStocks].sort((left, right) => {
      if (stockSort === 'market-value') return calculateStockMarketValue(right) - calculateStockMarketValue(left)
      if (stockSort === 'annual-dividend') return calculateAnnualDividendTwd(right) - calculateAnnualDividendTwd(left)
      if (stockSort === 'dividend-yield') return (right.estimatedYieldPercent || 0) - (left.estimatedYieldPercent || 0)
      if (stockSort === 'gain-percent') return (calculateStockUnrealizedGainPercent(right) ?? Number.NEGATIVE_INFINITY) - (calculateStockUnrealizedGainPercent(left) ?? Number.NEGATIVE_INFINITY)
      return left.symbol.localeCompare(right.symbol, 'en', { numeric: true })
    })
  }, [onlyCollateral, search, stockMarketFilter, stockSort, stocks])
  const filteredCash = cash.filter((item) => `${item.label} ${item.currency}`.toLowerCase().includes(search.toLowerCase()))
  const filteredCryptos = cryptos.filter((item) => `${item.symbol} ${item.name} ${item.platform}`.toLowerCase().includes(search.toLowerCase()))
  const filteredRealEstate = realEstate.filter((item) => `${item.name} ${realEstateTypeLabel(item.propertyType)}`.toLowerCase().includes(search.toLowerCase()))
  const annualEstimatedDividendTwd = useMemo(() => stocks.reduce((total, stock) => total + calculateAnnualDividendTwd(stock), 0), [stocks])
  const monthlyEstimatedDividendTwd = annualEstimatedDividendTwd / 12

  const openNewStock = () => {
    setEditingStock(null)
    setStockDraft({ ...defaultStockDraft })
    setQuoteState({ ...initialQuoteState })
    setStockModalOpen(true)
  }

  const openHoldingsImportPicker = () => {
    holdingsImportInputRef.current?.click()
  }

  const handleHoldingsImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'))
    event.target.value = ''
    if (files.length === 0) return

    setHoldingsImportModalOpen(true)
    setHoldingsImportStatus('recognizing')
    setHoldingsImportMessage('圖片只會在本機處理，正在準備 OCR…')
    setHoldingsImportProgress(null)
    setHoldingsImportCandidates([])
    setIsHoldingsImportSaving(false)
    try {
      const ocrResults = await recognizeHoldingImages(files, (progress) => {
        setHoldingsImportProgress(progress)
        setHoldingsImportMessage(`${progress.status || '辨識中'} · ${progress.percent}%`)
      })
      const candidates = ocrResults.flatMap((result) => parseHoldingScreenshotText(result.text, result.fileName)).map((candidate, index) => ({
        ...candidate,
        id: `${candidate.sourceFileName}-${index + 1}`,
      }))
      if (candidates.length === 0) throw new Error('沒有辨識到可用的股票代號。請確認截圖清楚包含代號與持倉欄位。')
      setHoldingsImportCandidates(candidates)
      setHoldingsImportStatus('review')
      setHoldingsImportMessage(`已辨識 ${candidates.length} 筆，請逐筆確認後再加入。`)
    } catch (error) {
      setHoldingsImportStatus('error')
      setHoldingsImportMessage(error instanceof Error ? error.message : '截圖辨識失敗，請換一張清楚的持倉截圖再試。')
    }
  }

  const updateHoldingsImportCandidate = (id: string, patch: Partial<HoldingImportCandidate>) => {
    setHoldingsImportCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate))
  }

  const handleConfirmHoldingsImport = async () => {
    const selectedCandidates = holdingsImportCandidates.filter((candidate) => candidate.selected)
    const incomplete = selectedCandidates.filter((candidate) => !candidate.symbol.trim() || candidate.shares === null || candidate.shares <= 0)
    if (selectedCandidates.length === 0) {
      setHoldingsImportMessage('請至少勾選一筆要加入的持倉。')
      return
    }
    if (incomplete.length > 0) {
      setHoldingsImportMessage('有勾選的持倉缺少股票代號或持有股數，請先補齊這兩欄。平均成本可稍後補填，目前價格會在加入時自動查詢。')
      return
    }

    setIsHoldingsImportSaving(true)
    setHoldingsImportMessage(`正在查詢 ${selectedCandidates.length} 筆最新行情，查不到的標的仍會先加入本機清單…`)
    try {
      const quoteCandidates = selectedCandidates
      const usdTwdExchangeRate = selectedCandidates.some((candidate) => candidate.market === 'US')
        ? await fetchUsdTwdExchangeRate().catch(() => null)
        : null
      const quoteByCandidateId = new Map<string, StockQuote>()
      const quoteFailures: string[] = []
      for (const [index, candidate] of quoteCandidates.entries()) {
        setHoldingsImportMessage(`正在查詢第 ${index + 1}/${quoteCandidates.length} 筆最新行情，查不到的標的仍會先加入本機清單…`)
        try {
          quoteByCandidateId.set(candidate.id, await fetchStockQuote(candidate.symbol, candidate.market))
        } catch {
          quoteFailures.push(candidate.symbol.trim().toUpperCase())
        }
      }
      const time = new Date().toISOString()
      const importedStocks: StockAsset[] = selectedCandidates.map((candidate) => {
        const symbol = candidate.symbol.trim().toUpperCase()
        const quote = quoteByCandidateId.get(candidate.id)
        const existing = stocks.find((stock) => stock.market === candidate.market && stock.symbol.trim().toUpperCase() === symbol)
        const quoteName = quote?.name?.trim() ?? ''
        const candidateName = candidate.name.trim()
        const importedName = quote && (!candidateName || candidateName.toUpperCase() === symbol) ? quoteName : candidateName || quoteName || symbol
        const importNote = candidate.reportedGain === null
          ? `持倉截圖辨識匯入：${candidate.sourceFileName}`
          : `持倉截圖辨識匯入：${candidate.sourceFileName}；截圖獲利 ${candidate.reportedGain >= 0 ? '+' : ''}${candidate.currency === 'USD' ? '$' : 'NT$'}${formatNumber(Math.abs(candidate.reportedGain))}${candidate.reportedGainPercent === null ? '' : `（${candidate.reportedGainPercent}%）`}`
        const currentPrice = quote?.price ?? candidate.currentPrice ?? 0
        const currency = quote?.currency ?? candidate.currency
        const notes = [
          existing?.notes.trim(),
          importNote,
          candidate.averageCost === null ? '平均成本待補填' : '',
          quote ? `加入時自動更新行情：${formatQuoteTime(quote.marketAt ?? quote.fetchedAt)}` : currentPrice > 0 ? '目前價格沿用截圖辨識值' : '目前價格尚未取得，請稍後按更新所有行情',
          quoteFailures.includes(symbol) ? `行情查詢失敗：${symbol}` : '',
          candidate.market === 'US' && !usdTwdExchangeRate ? 'USD/TWD 匯率待更新' : '',
        ].filter(Boolean).join('；')
        return {
          id: existing?.id ?? createId('stock'),
          kind: 'stock',
          createdAt: existing?.createdAt ?? time,
          updatedAt: time,
          isDemo: false,
          symbol,
          name: importedName,
          market: candidate.market,
          currency,
          exchangeRateToTwd: currency === 'TWD' ? 1 : usdTwdExchangeRate?.rate ?? existing?.exchangeRateToTwd ?? 1,
          shares: candidate.shares as number,
          averageCost: candidate.averageCost ?? 0,
          currentPrice,
          currentPriceSource: quote ? 'yahoo-public' : 'manual',
          currentPriceFetchedAt: quote?.fetchedAt,
          currentPriceMarketAt: quote?.marketAt ?? undefined,
          estimatedAnnualDividendPerShare: existing?.estimatedAnnualDividendPerShare ?? 0,
          estimatedYieldPercent: existing?.estimatedYieldPercent ?? 0,
          dividendSource: existing?.dividendSource,
          dividendFetchedAt: existing?.dividendFetchedAt,
          dividendPeriod: existing?.dividendPeriod,
          dividendPeriodStart: existing?.dividendPeriodStart,
          dividendPeriodEnd: existing?.dividendPeriodEnd,
          asCollateral: existing?.asCollateral ?? false,
          notes,
          ...((quote && existing) ? quoteDividendFields(quote, existing) : quote ? quoteDividendFields(quote) : {}),
        }
      })

      await onSaveStocks(importedStocks)
      const failureMessage = quoteFailures.length > 0 ? ` ${quoteFailures.length} 筆查價失敗，可稍後按「更新所有行情」。` : ''
      setHoldingsImportMessage(`已加入 ${importedStocks.length} 筆持倉。${failureMessage}`)
      setHoldingsImportModalOpen(false)
      setHoldingsImportCandidates([])
    } catch (error) {
      setHoldingsImportMessage(error instanceof Error ? error.message : '加入持倉失敗，請稍後再試。')
    } finally {
      setIsHoldingsImportSaving(false)
    }
  }

  const openEditStock = (stock: StockAsset) => {
    setEditingStock(stock)
    setStockDraft(stockDraftFrom(stock))
    setQuoteState({
      status: 'idle',
      message: '原有資料會保留；缺少配息資料時，儲存或使用頁面上方的「更新行情與配息」會自動補抓。',
      quote: null,
    })
    setStockModalOpen(true)
  }

  const openNewCash = () => {
    setEditingCash(null)
    setCashDraft({ ...defaultCashDraft })
    setCashModalOpen(true)
  }

  const openEditCash = (item: CashAsset) => {
    setEditingCash(item)
    setCashDraft(cashDraftFrom(item))
    setCashModalOpen(true)
  }

  const openNewCrypto = () => {
    setEditingCrypto(null)
    setCryptoDraft({ ...defaultCryptoDraft })
    setCryptoFormNotice(null)
    setCryptoModalOpen(true)
  }

  const openEditCrypto = (asset: CryptoAsset) => {
    setEditingCrypto(asset)
    setCryptoDraft(cryptoDraftFrom(asset))
    setCryptoFormNotice(null)
    setCryptoModalOpen(true)
  }

  const openNewRealEstate = () => {
    setEditingRealEstate(null)
    setRealEstateDraft({ ...defaultRealEstateDraft })
    setRealEstateModalOpen(true)
  }

  const openEditRealEstate = (asset: RealEstateAsset) => {
    setEditingRealEstate(asset)
    setRealEstateDraft(realEstateDraftFrom(asset))
    setRealEstateModalOpen(true)
  }

  const refreshStockQuote = async (): Promise<StockQuoteResult | null> => {
    const requestId = ++quoteRequestId.current
    const requestedSymbol = stockDraft.symbol.trim()
    if (!requestedSymbol) {
      setQuoteState({ status: 'error', message: '請先輸入股票代號，再查詢行情。', quote: null })
      return null
    }
    if (stockDraft.market === 'OTHER') {
      setQuoteState({ status: 'idle', message: '其他市場目前請手動輸入股價。', quote: null })
      return null
    }

    setQuoteState({ status: 'loading', message: '正在查詢公開行情…', quote: null })
    try {
      const { quote, exchangeRate } = await fetchStockQuoteResult(requestedSymbol, stockDraft.market)
      if (requestId !== quoteRequestId.current) return null
      setStockDraft((current) => ({
        ...current,
        currentPrice: quote.price,
        currentPriceSource: 'yahoo-public',
        currentPriceFetchedAt: quote.fetchedAt,
        currentPriceMarketAt: quote.marketAt ?? undefined,
        name: preferredStockName(current.name, quote.name),
        currency: current.market === 'TW' ? 'TWD' : current.market === 'US' ? 'USD' : current.currency,
        exchangeRateToTwd: quote.currency === 'TWD' ? 1 : exchangeRate?.rate ?? current.exchangeRateToTwd,
        ...quoteDividendFields(quote, current),
      }))
      setQuoteState({
        status: 'success',
        message: `已取得 ${quote.name}（${quote.yahooSymbol}）：${quote.currency === 'USD' ? '$' : 'NT$'}${formatNumber(quote.price, 2)}${exchangeRate ? ` · USD/TWD ${formatNumber(exchangeRate.rate, 4)}` : ''} · 行情時間 ${formatQuoteTime(quote.marketAt)}${quote.dividend ? ` · ${dividendPeriodLabel(quote.dividend.period)}配息已更新` : ' · 查無股利事件，保留原配息'}`,
        quote,
      })
      return { quote, exchangeRate }
    } catch (error) {
      if (requestId !== quoteRequestId.current) return null
      setQuoteState({ status: 'error', message: getQuoteErrorMessage(error), quote: null })
      return null
    }
  }

  const handleStockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAssetSaving) return
    setIsAssetSaving(true)
    try {
      let draftToSave = stockDraft
      let quoteResult: StockQuoteResult | null = null
      if ((draftToSave.currentPrice <= 0 || needsDividendRefreshForDraft(draftToSave)) && draftToSave.market !== 'OTHER') {
        quoteResult = await refreshStockQuote()
        if (quoteResult) {
          const { quote, exchangeRate } = quoteResult
          draftToSave = {
            ...draftToSave,
            currentPrice: quote.price,
            currentPriceSource: 'yahoo-public',
            currentPriceFetchedAt: quote.fetchedAt,
            currentPriceMarketAt: quote.marketAt ?? undefined,
            name: preferredStockName(draftToSave.name, quote.name),
            currency: quote.currency,
            exchangeRateToTwd: quote.currency === 'TWD' ? 1 : exchangeRate?.rate ?? draftToSave.exchangeRateToTwd,
            ...quoteDividendFields(quote, draftToSave),
          }
        }
      }
      if (draftToSave.currentPrice <= 0) {
        setQuoteState({ status: 'error', message: '請先取得公開行情，或手動輸入目前股價後再儲存。', quote: null })
        return
      }
      if (draftToSave.market === 'US') {
        try {
          const exchangeRate = quoteResult?.exchangeRate ?? await fetchUsdTwdExchangeRate()
          draftToSave = { ...draftToSave, exchangeRateToTwd: exchangeRate.rate }
        } catch (error) {
          setQuoteState({ status: 'error', message: error instanceof Error ? error.message : '無法取得美元／台幣匯率，請稍後再試。', quote: null })
          return
        }
      }
      const time = new Date().toISOString()
      await onSaveStock({
        ...draftToSave,
        id: editingStock?.id ?? createId('stock'),
        kind: 'stock',
        createdAt: editingStock?.createdAt ?? time,
        updatedAt: time,
        isDemo: false,
      })
      setStockModalOpen(false)
    } finally {
      setIsAssetSaving(false)
    }
  }

  const handleCashSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAssetSaving) return
    setIsAssetSaving(true)
    try {
      const time = new Date().toISOString()
      await onSaveCash({
        ...cashDraft,
        id: editingCash?.id ?? createId('cash'),
        kind: 'cash',
        createdAt: editingCash?.createdAt ?? time,
        updatedAt: time,
        isDemo: false,
      })
      setCashModalOpen(false)
    } finally {
      setIsAssetSaving(false)
    }
  }

  const handleCryptoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAssetSaving) return
    if (cryptoDraft.quantity <= 0 || cryptoDraft.currentPrice <= 0) {
      setCryptoFormNotice('請填入大於 0 的持有數量與目前價格。')
      return
    }

    setIsAssetSaving(true)
    try {
      let draftToSave = cryptoDraft
      if (cryptoDraft.currency === 'TWD') {
        draftToSave = { ...draftToSave, exchangeRateToTwd: 1 }
      } else {
        try {
          const exchangeRate = await fetchUsdTwdExchangeRate()
          draftToSave = { ...draftToSave, exchangeRateToTwd: exchangeRate.rate }
        } catch (error) {
          if (!Number.isFinite(cryptoDraft.exchangeRateToTwd) || cryptoDraft.exchangeRateToTwd <= 1) {
            setCryptoFormNotice(error instanceof Error ? error.message : '無法取得美元／台幣匯率，請稍後再試。')
            return
          }
          setCryptoFormNotice('目前離線，已保留你輸入的 USD/TWD 匯率。')
        }
      }

      const time = new Date().toISOString()
      await onSaveCrypto({
        ...draftToSave,
        id: editingCrypto?.id ?? createId('crypto'),
        kind: 'crypto',
        symbol: draftToSave.symbol.trim().toUpperCase(),
        name: draftToSave.name.trim() || draftToSave.symbol.trim().toUpperCase(),
        platform: draftToSave.platform.trim(),
        averageCost: Math.max(0, draftToSave.averageCost),
        currentPrice: Math.max(0, draftToSave.currentPrice),
        quantity: Math.max(0, draftToSave.quantity),
        notes: draftToSave.notes.trim(),
        createdAt: editingCrypto?.createdAt ?? time,
        updatedAt: time,
        isDemo: false,
      })
      setCryptoModalOpen(false)
    } finally {
      setIsAssetSaving(false)
    }
  }

  const handleRealEstateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAssetSaving) return
    setIsAssetSaving(true)
    try {
      const time = new Date().toISOString()
      await onSaveRealEstate({
        ...realEstateDraft,
        id: editingRealEstate?.id ?? createId('real-estate'),
        kind: 'real-estate',
        currentValueTwd: Math.max(0, realEstateDraft.currentValueTwd),
        purchasePriceTwd: Math.max(0, realEstateDraft.purchasePriceTwd),
        monthlyRentalIncomeTwd: Math.max(0, realEstateDraft.monthlyRentalIncomeTwd),
        name: realEstateDraft.name.trim(),
        notes: realEstateDraft.notes.trim(),
        createdAt: editingRealEstate?.createdAt ?? time,
        updatedAt: time,
        isDemo: false,
      })
      setRealEstateModalOpen(false)
    } finally {
      setIsAssetSaving(false)
    }
  }

  const handleRefreshAllStocks = async () => {
    if (quoteRefreshRunning.current) {
      setQuoteListNotice({ kind: 'success', message: '目前已有行情更新作業進行中，請等待完成。' })
      return
    }
    const refreshableStocks = stocks.filter((stock) => stock.market !== 'OTHER')
    if (refreshableStocks.length === 0) {
      setQuoteListNotice({ kind: 'error', message: '目前沒有可自動更新的台股或美股；其他市場請手動輸入價格。' })
      return
    }

    setIsRefreshingAll(true)
    setRefreshProgress({ completed: 0, total: refreshableStocks.length })
    setQuoteListNotice(null)
    quoteRefreshRunning.current = true
    try {
      const { updatedStocks, failedStocks, noDividendSymbols } = await refreshStockQuotesSequentially(refreshableStocks, (completed) => {
        setRefreshProgress((current) => current ? { ...current, completed } : current)
      })
      if (updatedStocks.length > 0) await onSaveStocks(updatedStocks)

      const skippedOtherMarket = stocks.length - refreshableStocks.length
      const summary = `已更新 ${updatedStocks.length}/${refreshableStocks.length} 筆行情、配息與殖利率。`
      const failures = formatQuoteFailureSummary(failedStocks)
      const missing = noDividendSymbols.length > 0 ? `尚無可計算配息：${noDividendSymbols.slice(0, 6).join('、')}${noDividendSymbols.length > 6 ? ' 等' : ''}。` : ''
      const skipped = skippedOtherMarket > 0 ? `另有 ${skippedOtherMarket} 筆其他市場未更新。` : ''
      setQuoteListNotice({ kind: failedStocks.length > 0 ? 'error' : 'success', message: [summary, failures, missing, skipped].filter(Boolean).join(' ') })
    } catch (error) {
      setQuoteListNotice({ kind: 'error', message: getQuoteErrorMessage(error) })
    } finally {
      setIsRefreshingAll(false)
      setRefreshProgress(null)
      quoteRefreshRunning.current = false
    }
  }

  const handleDeleteStock = async (stock: StockAsset) => {
    if (window.confirm(`確定要刪除 ${stock.symbol} 嗎？`)) await onDeleteStock(stock.id)
  }

  const handleDeleteCash = async (item: CashAsset) => {
    if (window.confirm(`確定要刪除「${item.label}」嗎？`)) await onDeleteCash(item.id)
  }

  const handleDeleteCrypto = async (asset: CryptoAsset) => {
    if (window.confirm(`確定要刪除「${asset.name || asset.symbol}」嗎？`)) await onDeleteCrypto(asset.id)
  }

  const handleDeleteRealEstate = async (asset: RealEstateAsset) => {
    if (window.confirm(`確定要刪除「${asset.name}」嗎？`)) await onDeleteRealEstate(asset.id)
  }

  const clearDividendMetadata = (current: StockDraft) => ({
    ...current,
    dividendSource: 'manual' as const,
    dividendFetchedAt: undefined,
    dividendPeriod: undefined,
    dividendPeriodStart: undefined,
    dividendPeriodEnd: undefined,
  })

  const updateManualDividend = (annualDividendPerShare: number) => {
    setStockDraft((current) => ({
      ...clearDividendMetadata(current),
      estimatedAnnualDividendPerShare: annualDividendPerShare,
      estimatedYieldPercent: current.currentPrice > 0 ? annualDividendPerShare / current.currentPrice * 100 : current.estimatedYieldPercent,
    }))
  }

  const updateManualYield = (estimatedYieldPercent: number) => {
    setStockDraft((current) => ({
      ...clearDividendMetadata(current),
      estimatedAnnualDividendPerShare: current.currentPrice > 0 ? current.currentPrice * estimatedYieldPercent / 100 : current.estimatedAnnualDividendPerShare,
      estimatedYieldPercent,
    }))
  }

  return (
    <div className="page-container">
      <section className="page-heading asset-page-heading">
        <input ref={holdingsImportInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => void handleHoldingsImportFiles(event)} />
        <div className="heading-actions asset-heading-actions">
          {activeTab === 'stocks' && <button type="button" className="button button-secondary asset-refresh-button" disabled={isRefreshingAll || stocks.length === 0} onClick={() => void handleRefreshAllStocks()}><RefreshCw className={isRefreshingAll ? 'spin-icon' : undefined} size={16} />{isRefreshingAll ? `更新中${refreshProgress ? ` ${refreshProgress.completed}/${refreshProgress.total}` : '…'}` : '更新行情與配息'}</button>}
          {activeTab === 'stocks' && <button type="button" className="button button-secondary" onClick={openHoldingsImportPicker}><ScanLine size={16} />從截圖匯入</button>}
          <button type="button" className="button button-primary" onClick={activeTab === 'stocks' ? openNewStock : activeTab === 'cash' ? openNewCash : activeTab === 'crypto' ? openNewCrypto : openNewRealEstate}><Plus size={17} />新增{activeTab === 'stocks' ? '股票' : activeTab === 'cash' ? '現金' : activeTab === 'crypto' ? '虛擬貨幣' : '房產'}</button>
        </div>
      </section>

      <section className="asset-toolbar card">
        <div className="segmented-control" role="tablist" aria-label="資產類型">
          <button type="button" role="tab" aria-selected={activeTab === 'stocks'} className={activeTab === 'stocks' ? 'is-active' : ''} onClick={() => { setActiveTab('stocks'); setSearch('') }}><BarChartGlyph />股票 <span>{stocks.length}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'cash'} className={activeTab === 'cash' ? 'is-active' : ''} onClick={() => { setActiveTab('cash'); setSearch('') }}><Banknote size={16} />現金 <span>{cash.length}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'crypto'} className={activeTab === 'crypto' ? 'is-active' : ''} onClick={() => { setActiveTab('crypto'); setSearch('') }}><Coins size={16} />虛擬貨幣 <span>{cryptos.length}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'realEstate'} className={activeTab === 'realEstate' ? 'is-active' : ''} onClick={() => { setActiveTab('realEstate'); setSearch('') }}><House size={16} />房產 <span>{realEstate.length}</span></button>
        </div>
        <label className="search-field"><Search size={17} /><span className="sr-only">搜尋資產</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === 'stocks' ? '搜尋代號或名稱' : activeTab === 'cash' ? '搜尋現金帳戶' : activeTab === 'crypto' ? '搜尋代號、名稱或平台' : '搜尋房產名稱'} /></label>
      </section>

      {activeTab === 'stocks' && <section className="stock-filter-strip card" aria-label="股票清單篩選與排序">
        <label className="stock-filter-control"><span>市場</span><select value={stockMarketFilter} onChange={(event) => setStockMarketFilter(event.target.value as StockMarketFilter)}><option value="all">全部市場</option><option value="TW">台股</option><option value="US">美股</option><option value="OTHER">其他市場</option></select></label>
        <label className="stock-filter-control"><span>排序</span><select value={stockSort} onChange={(event) => setStockSort(event.target.value as StockSort)}><option value="market-value">市值最高</option><option value="dividend-yield">殖利率最高</option><option value="annual-dividend">年配息最高</option><option value="gain-percent">損益比例最高</option><option value="symbol">代號 A～Z</option></select></label>
        <label className="stock-filter-check"><input type="checkbox" checked={onlyCollateral} onChange={(event) => setOnlyCollateral(event.target.checked)} /><span className="custom-checkbox"><Check size={12} /></span><span>只看質押擔保品</span></label>
        <span className="stock-filter-count">顯示 {filteredStocks.length}／{stocks.length} 筆</span>
      </section>}

      {activeTab === 'stocks' ? (
        <section className="card asset-table-card">
          <div className="section-heading-row asset-section-heading stock-section-heading">
            <div><div className="section-kicker">股票 / ETF</div><h2>持倉清單</h2></div>
            <div className="asset-dividend-summary"><div><span>持倉市值</span><strong>{formatTwd(stocks.reduce((total, stock) => total + calculateStockMarketValue(stock), 0), displayMode)}</strong></div><div><span>預估年配息</span><strong className="positive-text">{formatTwd(annualEstimatedDividendTwd, displayMode)}</strong></div><div><span>預估月配息</span><strong className="positive-text">{formatTwd(monthlyEstimatedDividendTwd, displayMode)}</strong></div></div>
          </div>
          {isRefreshingAll && refreshProgress && <div className="quote-refresh-progress" role="status" aria-live="polite"><div className="quote-refresh-progress-heading"><span><LoaderCircle size={14} className="spin-icon" />正在更新行情與配息</span><strong>{refreshProgress.completed}/{refreshProgress.total}</strong></div><div className="quote-refresh-progress-track"><span style={{ width: `${refreshProgress.total > 0 ? (refreshProgress.completed / refreshProgress.total) * 100 : 0}%` }} /></div></div>}
          {quoteListNotice && <div className={`quote-list-notice quote-list-notice-${quoteListNotice.kind}`} role={quoteListNotice.kind === 'error' ? 'alert' : 'status'}><Info size={14} />{quoteListNotice.message}</div>}
          {filteredStocks.length === 0 ? (
            <EmptyState icon={WalletCards} title={search ? '找不到符合的持倉' : '還沒有股票資產'} description={search ? '換一個代號或名稱試試。' : '輸入第一筆股票，首頁就會開始計算總資產。'} actionLabel={search ? undefined : '新增股票'} onAction={search ? undefined : openNewStock} />
          ) : (
            <div className="table-wrap stock-desktop-table">
              <table className="data-table">
                <thead><tr><th>股票</th><th>持有股數</th><th>現價</th><th>市值</th><th>未實現損益</th><th>配息／殖利率</th><th>質押擔保</th><th aria-label="操作" /></tr></thead>
                <tbody>
                  {filteredStocks.map((stock) => {
                    const gain = calculateStockUnrealizedGain(stock)
                    const gainPercent = calculateStockUnrealizedGainPercent(stock)
                    return <tr key={stock.id}>
                      <td data-label="股票"><div className="asset-cell"><span className="asset-avatar">{stock.symbol.slice(0, 2)}</span><div><strong>{stock.symbol}</strong><small>{stock.name}</small></div>{stock.isDemo && <span className="demo-badge">Demo</span>}</div></td>
                      <td data-label="持有股數">{formatNumber(stock.shares)}</td>
                      <td data-label="現價"><strong>{stock.currency === 'USD' ? '$' : 'NT$'}{formatNumber(stock.currentPrice, 2)}</strong><small className={`quote-source ${stock.currentPriceSource === 'yahoo-public' ? 'quote-source-live' : ''}`}>{stock.currentPriceSource === 'yahoo-public' && <span className="live-dot" />}{priceSourceLabel(stock)}</small>{stock.currency === 'USD' && <small className="exchange-rate-note">匯率 {formatNumber(stock.exchangeRateToTwd, 4)} TWD/USD</small>}</td>
                      <td data-label="市值"><strong>{formatTwd(calculateStockMarketValue(stock), displayMode)}</strong></td>
                      <td data-label="未實現損益">{stock.averageCost > 0 ? <><span className={gain >= 0 ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(gain, displayMode)}</span><small className={gain >= 0 ? 'positive-text' : 'negative-text'}>{formatPercent(gainPercent)}</small></> : <span>待補成本</span>}</td>
                      <td data-label="配息／殖利率"><strong>{dividendCurrency(stock)}{formatNumber(stock.estimatedAnnualDividendPerShare, 2)}</strong><small className={`dividend-source ${dividendStatusClass(stock)}`}>{formatPercent(stock.estimatedYieldPercent)} · {dividendPeriodLabel(stock.dividendPeriod)}</small><small className={`dividend-freshness ${dividendStatusClass(stock)}`}>{dividendStatusLabel(stock)}</small></td>
                      <td data-label="質押擔保"><span className={`collateral-tag ${stock.asCollateral ? 'is-on' : ''}`}>{stock.asCollateral ? <><Check size={13} />是</> : '否'}</span></td>
                      <td className="row-actions"><button type="button" className="icon-button small" aria-label={`查看 ${stock.symbol} 配息詳情`} title="配息詳情" onClick={() => setDividendDetailStock(stock)}><CircleDollarSign size={15} /></button><button type="button" className="icon-button small" aria-label={`編輯 ${stock.symbol}`} title="編輯" onClick={() => openEditStock(stock)}><Edit3 size={15} /></button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${stock.symbol}`} title="刪除" onClick={() => void handleDeleteStock(stock)}><Trash2 size={15} /></button></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredStocks.length > 0 && <div className="stock-mobile-list">{filteredStocks.map((stock) => <StockMobileCard key={stock.id} stock={stock} displayMode={displayMode} onEdit={() => openEditStock(stock)} onDelete={() => void handleDeleteStock(stock)} onDividendDetail={() => setDividendDetailStock(stock)} />)}</div>}
        </section>
      ) : activeTab === 'cash' ? (
        <section className="card asset-table-card">
          <div className="section-heading-row asset-section-heading">
            <div><div className="section-kicker">現金 / 存款</div><h2>現金清單</h2></div>
            <span className="section-caption">統一換算為 TWD</span>
          </div>
          {filteredCash.length === 0 ? (
            <EmptyState icon={Banknote} title={search ? '找不到符合的現金資料' : '還沒有現金資產'} description={search ? '換一個名稱或幣別試試。' : '加入台幣或美元現金，資產總額會同步更新。'} actionLabel={search ? undefined : '新增現金'} onAction={search ? undefined : openNewCash} />
          ) : (
            <div className="cash-grid">
              {filteredCash.map((item) => <article className="cash-asset-card" key={item.id}>
                <div className="cash-card-top"><span className="cash-avatar"><Banknote size={18} /></span><div><strong>{item.label}</strong><small>{item.currency} 現金</small></div>{item.isDemo && <span className="demo-badge">Demo</span>}</div>
                <div className="cash-card-amount">{item.currency === 'USD' ? '$' : 'NT$'}{formatNumber(item.amount, 2)}</div>
                <div className="cash-card-meta"><span>換算匯率</span><strong>{formatNumber(item.exchangeRateToTwd, 4)} TWD</strong></div>
                <div className="cash-card-meta"><span>折合台幣</span><strong>{formatTwd(calculateCashValue(item), displayMode)}</strong></div>
                <div className="cash-card-actions"><button type="button" className="button button-ghost" onClick={() => openEditCash(item)}><Edit3 size={15} />編輯</button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${item.label}`} onClick={() => void handleDeleteCash(item)}><Trash2 size={15} /></button></div>
              </article>)}
              <button type="button" className="add-asset-dashed" onClick={openNewCash}><Plus size={20} /><span>新增一筆現金</span></button>
            </div>
          )}
        </section>
      ) : activeTab === 'crypto' ? (
        <section className="card asset-table-card">
          <div className="section-heading-row asset-section-heading">
            <div><div className="section-kicker">虛擬貨幣 / Crypto</div><h2>虛擬貨幣清單</h2></div>
            <div className="asset-section-summary"><span>折合台幣</span><strong>{formatTwd(cryptos.reduce((total, crypto) => total + calculateCryptoMarketValue(crypto), 0), displayMode)}</strong><small>USD 匯率自動更新</small></div>
          </div>
          {filteredCryptos.length === 0 ? (
            <EmptyState icon={Coins} title={search ? '找不到符合的虛擬貨幣' : '還沒有虛擬貨幣資產'} description={search ? '換一個代號、名稱或平台試試。' : '加入 BTC、ETH 或其他代幣，資產總額會同步更新。'} actionLabel={search ? undefined : '新增虛擬貨幣'} onAction={search ? undefined : openNewCrypto} />
          ) : (
            <div className="cash-grid">
              {filteredCryptos.map((asset) => {
                const gain = calculateCryptoUnrealizedGain(asset)
                const gainPercent = calculateCryptoUnrealizedGainPercent(asset)
                const displayName = asset.name || asset.symbol
                const priceDecimals = asset.currentPrice < 1 ? 8 : 2
                return <article className="cash-asset-card crypto-asset-card" key={asset.id}>
                  <div className="cash-card-top"><span className="cash-avatar crypto-avatar"><Coins size={18} /></span><div><strong>{displayName}</strong><small>{asset.symbol}{asset.platform ? ` · ${asset.platform}` : ' · 未填平台／錢包'}</small></div>{asset.isDemo && <span className="demo-badge">Demo</span>}</div>
                  <div className="cash-card-amount">{assetCurrency(asset.currency)}{formatNumber(asset.currentPrice, priceDecimals)}</div>
                  <div className="cash-card-meta"><span>持有數量</span><strong>{formatNumber(asset.quantity, 8)}</strong></div>
                  <div className="cash-card-meta"><span>折合台幣</span><strong>{formatTwd(calculateCryptoMarketValue(asset), displayMode)}</strong></div>
                  <div className="cash-card-meta"><span>未實現損益</span><strong className={gain >= 0 ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(gain, displayMode)} <small>{formatPercent(gainPercent)}</small></strong></div>
                  <div className="cash-card-meta"><span>換算匯率</span><strong>{asset.currency === 'USD' ? `${formatNumber(asset.exchangeRateToTwd, 4)} TWD/USD` : '1 TWD/TWD'}</strong></div>
                  <div className="cash-card-actions"><button type="button" className="button button-ghost" onClick={() => openEditCrypto(asset)}><Edit3 size={15} />編輯</button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${displayName}`} onClick={() => void handleDeleteCrypto(asset)}><Trash2 size={15} /></button></div>
                </article>
              })}
              <button type="button" className="add-asset-dashed" onClick={openNewCrypto}><Plus size={20} /><span>新增一筆虛擬貨幣</span></button>
            </div>
          )}
        </section>
      ) : (
        <section className="card asset-table-card">
          <div className="section-heading-row asset-section-heading">
            <div><div className="section-kicker">房產 / 不動產</div><h2>房產清單</h2></div>
            <span className="section-caption">目前估值計入總資產</span>
          </div>
          {filteredRealEstate.length === 0 ? (
            <EmptyState icon={House} title={search ? '找不到符合的房產' : '還沒有房產資產'} description={search ? '換一個名稱或類型試試。' : '加入自住房、出租房或土地，淨資產會同步計算。'} actionLabel={search ? undefined : '新增房產'} onAction={search ? undefined : openNewRealEstate} />
          ) : (
            <div className="cash-grid">
              {filteredRealEstate.map((asset) => <article className="cash-asset-card real-estate-card" key={asset.id}>
                <div className="cash-card-top"><span className="cash-avatar real-estate-avatar"><House size={18} /></span><div><strong>{asset.name}</strong><small>{realEstateTypeLabel(asset.propertyType)}</small></div>{asset.isDemo && <span className="demo-badge">Demo</span>}</div>
                <div className="cash-card-amount">{formatTwd(calculateRealEstateValueTwd(asset), displayMode)}</div>
                <div className="cash-card-meta"><span>購入價格</span><strong>{formatTwd(asset.purchasePriceTwd, displayMode)}</strong></div>
                <div className="cash-card-meta"><span>每月租金收入</span><strong className={asset.monthlyRentalIncomeTwd > 0 ? 'positive-text' : ''}>{formatTwd(asset.monthlyRentalIncomeTwd, displayMode)}</strong></div>
                <div className="cash-card-actions"><button type="button" className="button button-ghost" onClick={() => openEditRealEstate(asset)}><Edit3 size={15} />編輯</button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${asset.name}`} onClick={() => void handleDeleteRealEstate(asset)}><Trash2 size={15} /></button></div>
              </article>)}
              <button type="button" className="add-asset-dashed" onClick={openNewRealEstate}><Plus size={20} /><span>新增一筆房產</span></button>
            </div>
          )}
        </section>
      )}

      {dividendDetailStock && <DividendDetailModal stock={dividendDetailStock} displayMode={displayMode} onClose={() => setDividendDetailStock(null)} />}

      {holdingsImportModalOpen && <HoldingsScreenshotImportModal status={holdingsImportStatus} progress={holdingsImportProgress} message={holdingsImportMessage} candidates={holdingsImportCandidates} onClose={() => setHoldingsImportModalOpen(false)} onChooseFiles={openHoldingsImportPicker} onUpdateCandidate={updateHoldingsImportCandidate} onConfirm={() => void handleConfirmHoldingsImport()} isConfirming={isHoldingsImportSaving} />}

      {stockModalOpen && <Modal title={editingStock ? '編輯股票資產' : '新增股票資產'} description="持股資料只存這台裝置；查價時只送股票代號與 USD/TWD 匯率代號給公開行情服務，台股會同步帶入中文名稱與配息資料。" onClose={() => setStockModalOpen(false)}>
        <form className="asset-form" onSubmit={(event) => void handleStockSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="股票代號"><input required value={stockDraft.symbol} onChange={(event) => { const symbol = event.target.value.toUpperCase(); setStockDraft((current) => symbol === current.symbol ? { ...current, symbol } : { ...clearDividendMetadata(current), symbol, name: '', currentPrice: 0, currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined, estimatedAnnualDividendPerShare: 0, estimatedYieldPercent: 0 }); setQuoteState({ status: 'idle', message: '輸入代號後離開欄位，會自動查詢行情、中文名稱與配息；批次更新請使用頁面上方按鈕。', quote: null }) }} onBlur={() => { if (stockDraft.symbol.trim()) void refreshStockQuote() }} placeholder={stockDraft.market === 'US' ? '例如 AAPL、TSLA 或 BRK.B' : stockDraft.market === 'TW' ? '例如 00878' : '例如股票代號'} /></FormField>
            <FormField label="股票名稱" hint={stockDraft.market === 'TW' ? '台股自動帶入中文' : undefined}><input required value={stockDraft.name} onChange={(event) => setStockDraft((current) => ({ ...current, name: event.target.value }))} placeholder={stockDraft.market === 'TW' ? '自動帶入或例如 國泰永續高股息' : '自動帶入或手動輸入'} /></FormField>
            <FormField label="市場"><div className="select-wrap"><select value={stockDraft.market} onChange={(event) => { const market = event.target.value as Market; setStockDraft((current) => ({ ...clearDividendMetadata(current), market, name: '', currentPrice: 0, currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined, currency: market === 'TW' ? 'TWD' : market === 'US' ? 'USD' : current.currency, exchangeRateToTwd: market === 'TW' ? 1 : current.exchangeRateToTwd })); setQuoteState({ status: 'idle', message: market === 'OTHER' ? '其他市場目前請手動輸入股價與名稱。' : market === 'US' ? '美股可輸入 AAPL、TSLA、BRK.B；離開代號欄位後會自動查詢行情與配息。' : '輸入代號後離開欄位，會自動查詢行情與名稱；價格也可以手動輸入。', quote: null }) }}><option value="TW">台股</option><option value="US">美股</option><option value="OTHER">其他</option></select><SelectChevron /></div></FormField>
            <FormField label="幣別"><div className="select-wrap"><select value={stockDraft.currency} onChange={(event) => setStockDraft((current) => ({ ...current, currency: event.target.value as Currency, exchangeRateToTwd: event.target.value === 'TWD' ? 1 : current.exchangeRateToTwd }))}><option value="TWD">TWD / 新台幣</option><option value="USD">USD / 美元</option></select><SelectChevron /></div></FormField>
            <FormField label="持有股數"><input required min="0" step="any" type="number" value={stockDraft.shares || ''} onChange={(event) => setStockDraft((current) => ({ ...current, shares: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="平均成本" hint={`/${stockDraft.currency}`}><input required min="0" step="any" type="number" value={stockDraft.averageCost || ''} onChange={(event) => setStockDraft((current) => ({ ...current, averageCost: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="目前股價" hint={`/${stockDraft.currency}`}><input required min="0" step="any" type="number" value={stockDraft.currentPrice || ''} onChange={(event) => { const currentPrice = Number(event.target.value); setStockDraft((current) => ({ ...current, currentPrice, currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined, estimatedYieldPercent: current.dividendSource === 'yahoo-public' && currentPrice > 0 ? current.estimatedAnnualDividendPerShare / currentPrice * 100 : current.estimatedYieldPercent })); setQuoteState({ status: 'idle', message: '目前價格已改為手動輸入；殖利率會依自動配息資料重新換算。', quote: null }) }} placeholder="自動帶入或手動輸入" /></FormField>
            <FormField label="匯率" hint={stockDraft.currency === 'USD' ? '自動抓取 USD/TWD' : '換算 TWD'}><input required min="0.0001" step="any" type="number" value={stockDraft.exchangeRateToTwd} disabled={stockDraft.currency === 'TWD'} onChange={(event) => setStockDraft((current) => ({ ...current, exchangeRateToTwd: Number(event.target.value) }))} /></FormField>
            <FormField label="年度每股配息" hint={`/${stockDraft.currency}`}><input min="0" step="any" type="number" value={stockDraft.estimatedAnnualDividendPerShare || ''} onChange={(event) => updateManualDividend(Number(event.target.value))} placeholder="自動帶入或手動輸入" /></FormField>
            <FormField label="預估殖利率" hint="%"><input min="0" step="any" type="number" value={stockDraft.estimatedYieldPercent || ''} onChange={(event) => updateManualYield(Number(event.target.value))} placeholder="自動計算或手動輸入" /></FormField>
          </div>
          <div className={`quote-status quote-status-${quoteState.status}`} role="status" aria-live="polite"><Info size={14} /><span>{quoteState.message}</span>{quoteState.status === 'success' && <small>{PUBLIC_QUOTE_PROVIDER_LABEL}</small>}</div>
          {stockDraft.dividendSource === 'yahoo-public' && <div className="dividend-auto-note" role="status"><Info size={14} /><span>自動配息：{dividendPeriodLabel(stockDraft.dividendPeriod)} {stockDraft.dividendPeriodStart}～{stockDraft.dividendPeriodEnd}，年配息 {dividendCurrency(stockDraft)}{formatNumber(stockDraft.estimatedAnnualDividendPerShare, 2)}，年化殖利率 {formatPercent(stockDraft.estimatedYieldPercent)}。</span></div>}
          <label className="checkbox-field"><input type="checkbox" checked={stockDraft.asCollateral} onChange={(event) => setStockDraft((current) => ({ ...current, asCollateral: event.target.checked }))} /><span className="custom-checkbox"><Check size={13} /></span><span>標記為未來可用的質押擔保品</span></label>
          <FormField label="備註" wide><textarea value={stockDraft.notes} onChange={(event) => setStockDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如：價格更新日期、資料來源或自己的備註" rows={3} /></FormField>
<div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setStockModalOpen(false)} disabled={isAssetSaving}>取消</button><button type="submit" className="button button-primary" disabled={isAssetSaving}>{isAssetSaving ? <LoaderCircle size={16} className="spin-icon" /> : <Check size={16} />}{isAssetSaving ? '儲存中…' : '儲存股票'}</button></div>
        </form>
      </Modal>}

      {cashModalOpen && <Modal title={editingCash ? '編輯現金資產' : '新增現金資產'} description="美元資產需要手動填入換算匯率。" onClose={() => setCashModalOpen(false)}>
        <form className="asset-form" onSubmit={(event) => void handleCashSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="資產名稱" wide><input required value={cashDraft.label} onChange={(event) => setCashDraft((current) => ({ ...current, label: event.target.value }))} placeholder="例如 日常備用現金" /></FormField>
            <FormField label="幣別"><div className="select-wrap"><select value={cashDraft.currency} onChange={(event) => setCashDraft((current) => ({ ...current, currency: event.target.value as Currency, exchangeRateToTwd: event.target.value === 'TWD' ? 1 : current.exchangeRateToTwd }))}><option value="TWD">TWD / 新台幣</option><option value="USD">USD / 美元</option></select><SelectChevron /></div></FormField>
            <FormField label="金額"><input required min="0" step="any" type="number" value={cashDraft.amount || ''} onChange={(event) => setCashDraft((current) => ({ ...current, amount: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="匯率" hint="換算 TWD"><input required min="0.0001" step="any" type="number" disabled={cashDraft.currency === 'TWD'} value={cashDraft.exchangeRateToTwd} onChange={(event) => setCashDraft((current) => ({ ...current, exchangeRateToTwd: Number(event.target.value) }))} /></FormField>
          </div>
          <FormField label="備註" wide><textarea value={cashDraft.notes} onChange={(event) => setCashDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如：銀行或帳戶用途" rows={3} /></FormField>
<div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setCashModalOpen(false)} disabled={isAssetSaving}>取消</button><button type="submit" className="button button-primary" disabled={isAssetSaving}>{isAssetSaving ? <LoaderCircle size={16} className="spin-icon" /> : <Check size={16} />}{isAssetSaving ? '儲存中…' : '儲存現金'}</button></div>
        </form>
      </Modal>}

      {cryptoModalOpen && <Modal title={editingCrypto ? '編輯虛擬貨幣資產' : '新增虛擬貨幣資產'} description="價格目前手動輸入；美元資產儲存時會自動取得 USD/TWD 匯率，資料只存在這台裝置。" onClose={() => setCryptoModalOpen(false)}>
        <form className="asset-form" onSubmit={(event) => void handleCryptoSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="虛擬貨幣代號"><input required value={cryptoDraft.symbol} onChange={(event) => setCryptoDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} placeholder="例如 BTC、ETH、SOL" /></FormField>
            <FormField label="名稱" hint="可留空自動使用代號"><input value={cryptoDraft.name} onChange={(event) => setCryptoDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 Bitcoin" /></FormField>
            <FormField label="交易所／錢包" wide><input value={cryptoDraft.platform} onChange={(event) => setCryptoDraft((current) => ({ ...current, platform: event.target.value }))} placeholder="例如 Binance、MaiCoin、冷錢包" /></FormField>
            <FormField label="計價幣別"><div className="select-wrap"><select value={cryptoDraft.currency} onChange={(event) => setCryptoDraft((current) => ({ ...current, currency: event.target.value as Currency, exchangeRateToTwd: event.target.value === 'TWD' ? 1 : current.exchangeRateToTwd }))}><option value="USD">USD / 美元</option><option value="TWD">TWD / 新台幣</option></select><SelectChevron /></div></FormField>
            <FormField label="持有數量"><input required min="0" step="any" type="number" value={cryptoDraft.quantity || ''} onChange={(event) => setCryptoDraft((current) => ({ ...current, quantity: Number(event.target.value) }))} placeholder="例如 0.25" /></FormField>
            <FormField label="平均成本" hint={`/${cryptoDraft.currency}`}><input min="0" step="any" type="number" value={cryptoDraft.averageCost || ''} onChange={(event) => setCryptoDraft((current) => ({ ...current, averageCost: Number(event.target.value) }))} placeholder="例如 42000" /></FormField>
            <FormField label="目前價格" hint={`/${cryptoDraft.currency}`}><input required min="0" step="any" type="number" value={cryptoDraft.currentPrice || ''} onChange={(event) => setCryptoDraft((current) => ({ ...current, currentPrice: Number(event.target.value) }))} placeholder="手動輸入目前價格" /></FormField>
            <FormField label="匯率" hint={cryptoDraft.currency === 'USD' ? 'USD/TWD 自動抓取；離線可保留手動值' : '換算 TWD'}><input required min="0.0001" step="any" type="number" disabled={cryptoDraft.currency === 'TWD'} value={cryptoDraft.exchangeRateToTwd} onChange={(event) => setCryptoDraft((current) => ({ ...current, exchangeRateToTwd: Number(event.target.value) }))} /></FormField>
          </div>
          {cryptoFormNotice && <div className="quote-status quote-status-error" role="alert"><Info size={14} /><span>{cryptoFormNotice}</span></div>}
          <FormField label="備註" wide><textarea value={cryptoDraft.notes} onChange={(event) => setCryptoDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如：持有地址、估值日期或資料來源" rows={3} /></FormField>
<div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setCryptoModalOpen(false)} disabled={isAssetSaving}>取消</button><button type="submit" className="button button-primary" disabled={isAssetSaving}>{isAssetSaving ? <LoaderCircle size={16} className="spin-icon" /> : <Check size={16} />}{isAssetSaving ? '儲存中…' : '儲存虛擬貨幣'}</button></div>
        </form>
      </Modal>}

      {realEstateModalOpen && <Modal title={editingRealEstate ? '編輯房產資產' : '新增房產資產'} description="房產目前估值會計入總資產；房貸請另外建立一般負債。" onClose={() => setRealEstateModalOpen(false)}>
        <form className="asset-form" onSubmit={(event) => void handleRealEstateSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="房產名稱" wide><input required value={realEstateDraft.name} onChange={(event) => setRealEstateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 自住房／台北房產" /></FormField>
            <FormField label="房產類型"><div className="select-wrap"><select value={realEstateDraft.propertyType} onChange={(event) => setRealEstateDraft((current) => ({ ...current, propertyType: event.target.value as RealEstateType }))}><option value="residential">住宅</option><option value="commercial">商用不動產</option><option value="land">土地</option><option value="other">其他房產</option></select><SelectChevron /></div></FormField>
            <FormField label="目前估值" hint="TWD"><input required min="0" step="any" type="number" value={realEstateDraft.currentValueTwd || ''} onChange={(event) => setRealEstateDraft((current) => ({ ...current, currentValueTwd: Number(event.target.value) }))} placeholder="例如 12,000,000" /></FormField>
            <FormField label="購入價格" hint="TWD"><input min="0" step="any" type="number" value={realEstateDraft.purchasePriceTwd || ''} onChange={(event) => setRealEstateDraft((current) => ({ ...current, purchasePriceTwd: Number(event.target.value) }))} placeholder="可留空" /></FormField>
            <FormField label="每月租金收入" hint="TWD／沒有請填 0" wide><input min="0" step="any" type="number" value={realEstateDraft.monthlyRentalIncomeTwd || ''} onChange={(event) => setRealEstateDraft((current) => ({ ...current, monthlyRentalIncomeTwd: Number(event.target.value) }))} placeholder="0" /></FormField>
          </div>
          <FormField label="備註" wide><textarea value={realEstateDraft.notes} onChange={(event) => setRealEstateDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如 地址區域、估值日期或產權備註" rows={3} /></FormField>
<div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setRealEstateModalOpen(false)} disabled={isAssetSaving}>取消</button><button type="submit" className="button button-primary" disabled={isAssetSaving}>{isAssetSaving ? <LoaderCircle size={16} className="spin-icon" /> : <Check size={16} />}{isAssetSaving ? '儲存中…' : '儲存房產'}</button></div>
        </form>
      </Modal>}
    </div>
  )
}

function BarChartGlyph() {
  return <span className="mini-bars" aria-hidden="true"><i /><i /><i /></span>
}
