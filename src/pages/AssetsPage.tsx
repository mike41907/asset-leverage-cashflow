import { useRef, useState, type FormEvent } from 'react'
import {
  Banknote,
  Check,
  ChevronDown,
  Edit3,
  House,
  Info,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import type { CashAsset, Currency, Market, RealEstateAsset, RealEstateType, StockAsset, StockDividendPeriod } from '../domain/models'
import { calculateCashValue, calculateRealEstateValueTwd, calculateStockMarketValue, calculateStockUnrealizedGain, calculateStockUnrealizedGainPercent } from '../domain/calculations'
import { formatCurrencyWithSign, formatNumber, formatPercent, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'
import { EmptyState } from '../components/EmptyState'
import { fetchStockQuote, hasChineseName, PUBLIC_QUOTE_PROVIDER_LABEL, type StockQuote } from '../services/quoteService'

interface AssetsPageProps {
  stocks: StockAsset[]
  cash: CashAsset[]
  realEstate: RealEstateAsset[]
  displayMode: 'exact' | 'compact'
  onSaveStock: (stock: StockAsset) => Promise<void>
  onSaveStocks: (stocks: StockAsset[]) => Promise<void>
  onDeleteStock: (id: string) => Promise<void>
  onSaveCash: (cash: CashAsset) => Promise<void>
  onDeleteCash: (id: string) => Promise<void>
  onSaveRealEstate: (asset: RealEstateAsset) => Promise<void>
  onDeleteRealEstate: (id: string) => Promise<void>
}

type AssetTab = 'stocks' | 'cash' | 'realEstate'
type StockDraft = Omit<StockAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>
type CashDraft = Omit<CashAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>
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

function dividendCurrency(stock: Pick<StockAsset, 'currency'>): string {
  return stock.currency === 'USD' ? '$' : 'NT$'
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

function applyQuoteToStock(stock: StockAsset, quote: StockQuote): StockAsset {
  return {
    ...stock,
    currentPrice: quote.price,
    currentPriceSource: 'yahoo-public',
    currentPriceFetchedAt: quote.fetchedAt,
    currentPriceMarketAt: quote.marketAt ?? undefined,
    name: preferredStockName(stock.name, quote.name),
    currency: quote.currency,
    exchangeRateToTwd: quote.currency === 'TWD' ? 1 : stock.exchangeRateToTwd,
    ...quoteDividendFields(quote, stock),
    updatedAt: new Date().toISOString(),
  }
}

function StockMobileCard({ stock, displayMode, onEdit, onDelete }: { stock: StockAsset; displayMode: 'exact' | 'compact'; onEdit: () => void; onDelete: () => void }) {
  const gain = calculateStockUnrealizedGain(stock)
  const gainPercent = calculateStockUnrealizedGainPercent(stock)
  const isPositive = gain >= 0

  return (
    <article className="stock-mobile-card">
      <div className="stock-mobile-card-header">
        <div className="asset-cell"><span className="asset-avatar">{stock.symbol.slice(0, 2)}</span><div><strong>{stock.symbol}</strong><small>{stock.name}</small></div>{stock.isDemo && <span className="demo-badge">Demo</span>}</div>
        <div className="stock-mobile-card-actions"><button type="button" className="icon-button small" aria-label={`編輯 ${stock.symbol}`} title="編輯" onClick={onEdit}><Edit3 size={17} /></button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${stock.symbol}`} title="刪除" onClick={onDelete}><Trash2 size={17} /></button></div>
      </div>
      <div className="stock-mobile-card-main">
        <div className="stock-mobile-card-holding"><span>持有 {formatNumber(stock.shares)}</span><small>成本 {stock.currency === 'USD' ? '$' : 'NT$'}{formatNumber(stock.averageCost, 2)}</small></div>
        <div className="stock-mobile-card-value"><span>市值</span><strong>{formatTwd(calculateStockMarketValue(stock), displayMode)}</strong><small>現價 {stock.currency === 'USD' ? '$' : 'NT$'}{formatNumber(stock.currentPrice, 2)}</small></div>
      </div>
      <div className="stock-mobile-card-footer"><span className={isPositive ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(gain, displayMode)} <small>{formatPercent(gainPercent)}</small></span><span className={`quote-source ${stock.currentPriceSource === 'yahoo-public' ? 'quote-source-live' : ''}`}>{stock.currentPriceSource === 'yahoo-public' && <span className="live-dot" />}{priceSourceLabel(stock)}</span><span className="stock-mobile-card-dividend">年配息 {dividendCurrency(stock)}{formatNumber(stock.estimatedAnnualDividendPerShare, 2)} · 殖利率 {formatPercent(stock.estimatedYieldPercent)}<small>{dividendPeriodLabel(stock.dividendPeriod)}</small></span><span className="stock-mobile-card-collateral">質押擔保 {stock.asCollateral ? '是' : '否'}</span></div>
    </article>
  )
}

function FormField({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`form-field ${wide ? 'form-field-wide' : ''}`}><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="asset-modal-title">
        <div className="modal-header">
          <div><div className="section-kicker">資產資料</div><h2 id="asset-modal-title">{title}</h2><p>{description}</p></div>
          <button type="button" className="icon-button" aria-label="關閉視窗" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function SelectChevron() {
  return <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
}

export function AssetsPage({ stocks, cash, realEstate, displayMode, onSaveStock, onSaveStocks, onDeleteStock, onSaveCash, onDeleteCash, onSaveRealEstate, onDeleteRealEstate }: AssetsPageProps) {
  const [activeTab, setActiveTab] = useState<AssetTab>('stocks')
  const [search, setSearch] = useState('')
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [cashModalOpen, setCashModalOpen] = useState(false)
  const [realEstateModalOpen, setRealEstateModalOpen] = useState(false)
  const [editingStock, setEditingStock] = useState<StockAsset | null>(null)
  const [editingCash, setEditingCash] = useState<CashAsset | null>(null)
  const [editingRealEstate, setEditingRealEstate] = useState<RealEstateAsset | null>(null)
  const [stockDraft, setStockDraft] = useState<StockDraft>(defaultStockDraft)
  const [cashDraft, setCashDraft] = useState<CashDraft>(defaultCashDraft)
  const [realEstateDraft, setRealEstateDraft] = useState<RealEstateDraft>(defaultRealEstateDraft)
  const [quoteState, setQuoteState] = useState<QuoteState>(initialQuoteState)
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)
  const [quoteListNotice, setQuoteListNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const quoteRequestId = useRef(0)

  const filteredStocks = stocks.filter((stock) => `${stock.symbol} ${stock.name}`.toLowerCase().includes(search.toLowerCase()))
  const filteredCash = cash.filter((item) => `${item.label} ${item.currency}`.toLowerCase().includes(search.toLowerCase()))
  const filteredRealEstate = realEstate.filter((item) => `${item.name} ${realEstateTypeLabel(item.propertyType)}`.toLowerCase().includes(search.toLowerCase()))

  const openNewStock = () => {
    setEditingStock(null)
    setStockDraft({ ...defaultStockDraft })
    setQuoteState({ ...initialQuoteState })
    setStockModalOpen(true)
  }

  const openEditStock = (stock: StockAsset) => {
    setEditingStock(stock)
    setStockDraft(stockDraftFrom(stock))
    setQuoteState({
      status: 'idle',
      message: '原有價格與名稱會保留；需要更新時請使用頁面上方的「更新所有行情」。',
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

  const refreshStockQuote = async (): Promise<StockQuote | null> => {
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
      const quote = await fetchStockQuote(requestedSymbol, stockDraft.market)
      if (requestId !== quoteRequestId.current) return null
      setStockDraft((current) => ({
        ...current,
        currentPrice: quote.price,
        currentPriceSource: 'yahoo-public',
        currentPriceFetchedAt: quote.fetchedAt,
        currentPriceMarketAt: quote.marketAt ?? undefined,
        name: preferredStockName(current.name, quote.name),
        currency: current.market === 'TW' ? 'TWD' : current.market === 'US' ? 'USD' : current.currency,
        ...quoteDividendFields(quote, current),
      }))
      setQuoteState({
        status: 'success',
        message: `已取得 ${quote.name}（${quote.yahooSymbol}）：${quote.currency === 'USD' ? '$' : 'NT$'}${formatNumber(quote.price, 2)} · 行情時間 ${formatQuoteTime(quote.marketAt)}${quote.dividend ? ` · ${dividendPeriodLabel(quote.dividend.period)}配息已更新` : ' · 查無股利事件，保留原配息'}`,
        quote,
      })
      return quote
    } catch (error) {
      if (requestId !== quoteRequestId.current) return null
      setQuoteState({ status: 'error', message: getQuoteErrorMessage(error), quote: null })
      return null
    }
  }

  const handleStockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    let draftToSave = stockDraft
    if (draftToSave.currentPrice <= 0 && draftToSave.market !== 'OTHER') {
      const quote = await refreshStockQuote()
      if (quote) {
        draftToSave = {
          ...draftToSave,
          currentPrice: quote.price,
          currentPriceSource: 'yahoo-public',
          currentPriceFetchedAt: quote.fetchedAt,
          currentPriceMarketAt: quote.marketAt ?? undefined,
          name: preferredStockName(draftToSave.name, quote.name),
          currency: quote.currency,
          exchangeRateToTwd: quote.currency === 'TWD' ? 1 : draftToSave.exchangeRateToTwd,
          ...quoteDividendFields(quote, draftToSave),
        }
      }
    }
    if (draftToSave.currentPrice <= 0) {
      setQuoteState({ status: 'error', message: '請先取得公開行情，或手動輸入目前股價後再儲存。', quote: null })
      return
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
  }

  const handleCashSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
  }

  const handleRealEstateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
  }

  const handleRefreshAllStocks = async () => {
    const refreshableStocks = stocks.filter((stock) => stock.market !== 'OTHER')
    if (refreshableStocks.length === 0) {
      setQuoteListNotice({ kind: 'error', message: '目前沒有可自動更新的台股或美股；其他市場請手動輸入價格。' })
      return
    }

    setIsRefreshingAll(true)
    setQuoteListNotice(null)
    try {
      const results = await Promise.allSettled(refreshableStocks.map(async (stock) => {
        const quote = await fetchStockQuote(stock.symbol, stock.market)
        return applyQuoteToStock(stock, quote)
      }))
      const updatedStocks = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      const failedStocks = results.flatMap((result, index) => result.status === 'rejected' ? [{ symbol: refreshableStocks[index].symbol, error: getQuoteErrorMessage(result.reason) }] : [])
      if (updatedStocks.length > 0) await onSaveStocks(updatedStocks)

      const skippedOtherMarket = stocks.length - refreshableStocks.length
      const summary = `已更新 ${updatedStocks.length}/${refreshableStocks.length} 筆行情。`
      const failures = failedStocks.length > 0 ? `失敗：${failedStocks.map((item) => `${item.symbol}（${item.error}）`).join('、')}` : ''
      const skipped = skippedOtherMarket > 0 ? `另有 ${skippedOtherMarket} 筆其他市場未更新。` : ''
      setQuoteListNotice({ kind: failedStocks.length > 0 ? 'error' : 'success', message: [summary, failures, skipped].filter(Boolean).join(' ') })
    } catch (error) {
      setQuoteListNotice({ kind: 'error', message: getQuoteErrorMessage(error) })
    } finally {
      setIsRefreshingAll(false)
    }
  }

  const handleDeleteStock = async (stock: StockAsset) => {
    if (window.confirm(`確定要刪除 ${stock.symbol} 嗎？`)) await onDeleteStock(stock.id)
  }

  const handleDeleteCash = async (item: CashAsset) => {
    if (window.confirm(`確定要刪除「${item.label}」嗎？`)) await onDeleteCash(item.id)
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
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-mark" />資產資料庫</div>
          <h1>你的資產，<span>一筆一筆記清楚。</span></h1>
          <p>新增股票時會先帶入公開行情；成本、匯率與配息仍由你控制，查不到時也能手動輸入。</p>
        </div>
        <div className="heading-actions">
          {activeTab === 'stocks' && <button type="button" className="button button-secondary" disabled={isRefreshingAll || stocks.length === 0} onClick={() => void handleRefreshAllStocks()}><RefreshCw className={isRefreshingAll ? 'spin-icon' : undefined} size={16} />{isRefreshingAll ? '更新中…' : '更新所有行情'}</button>}
          <button type="button" className="button button-primary" onClick={activeTab === 'stocks' ? openNewStock : activeTab === 'cash' ? openNewCash : openNewRealEstate}><Plus size={17} />新增{activeTab === 'stocks' ? '股票' : activeTab === 'cash' ? '現金' : '房產'}</button>
        </div>
      </section>

      <section className="asset-toolbar card">
        <div className="segmented-control" role="tablist" aria-label="資產類型">
          <button type="button" role="tab" aria-selected={activeTab === 'stocks'} className={activeTab === 'stocks' ? 'is-active' : ''} onClick={() => { setActiveTab('stocks'); setSearch('') }}><BarChartGlyph />股票 <span>{stocks.length}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'cash'} className={activeTab === 'cash' ? 'is-active' : ''} onClick={() => { setActiveTab('cash'); setSearch('') }}><Banknote size={16} />現金 <span>{cash.length}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'realEstate'} className={activeTab === 'realEstate' ? 'is-active' : ''} onClick={() => { setActiveTab('realEstate'); setSearch('') }}><House size={16} />房產 <span>{realEstate.length}</span></button>
        </div>
        <label className="search-field"><Search size={17} /><span className="sr-only">搜尋資產</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === 'stocks' ? '搜尋代號或名稱' : activeTab === 'cash' ? '搜尋現金帳戶' : '搜尋房產名稱'} /></label>
      </section>

      {activeTab === 'stocks' ? (
        <section className="card asset-table-card">
          <div className="section-heading-row asset-section-heading">
            <div><div className="section-kicker">股票 / ETF</div><h2>持倉清單</h2></div>
            <div className="asset-section-summary"><span>持倉市值</span><strong>{formatTwd(stocks.reduce((total, stock) => total + calculateStockMarketValue(stock), 0), displayMode)}</strong><small>公開行情＋手動備援</small></div>
          </div>
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
                      <td data-label="現價"><strong>{stock.currency === 'USD' ? '$' : 'NT$'}{formatNumber(stock.currentPrice, 2)}</strong><small className={`quote-source ${stock.currentPriceSource === 'yahoo-public' ? 'quote-source-live' : ''}`}>{stock.currentPriceSource === 'yahoo-public' && <span className="live-dot" />}{priceSourceLabel(stock)}</small></td>
                      <td data-label="市值"><strong>{formatTwd(calculateStockMarketValue(stock), displayMode)}</strong></td>
                      <td data-label="未實現損益"><span className={gain >= 0 ? 'positive-text' : 'negative-text'}>{formatCurrencyWithSign(gain, displayMode)}</span><small className={gain >= 0 ? 'positive-text' : 'negative-text'}>{formatPercent(gainPercent)}</small></td>
                      <td data-label="配息／殖利率"><strong>{dividendCurrency(stock)}{formatNumber(stock.estimatedAnnualDividendPerShare, 2)}</strong><small className="dividend-source">{formatPercent(stock.estimatedYieldPercent)} · {dividendPeriodLabel(stock.dividendPeriod)}</small></td>
                      <td data-label="質押擔保"><span className={`collateral-tag ${stock.asCollateral ? 'is-on' : ''}`}>{stock.asCollateral ? <><Check size={13} />是</> : '否'}</span></td>
                      <td className="row-actions"><button type="button" className="icon-button small" aria-label={`編輯 ${stock.symbol}`} title="編輯" onClick={() => openEditStock(stock)}><Edit3 size={15} /></button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${stock.symbol}`} title="刪除" onClick={() => void handleDeleteStock(stock)}><Trash2 size={15} /></button></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredStocks.length > 0 && <div className="stock-mobile-list">{filteredStocks.map((stock) => <StockMobileCard key={stock.id} stock={stock} displayMode={displayMode} onEdit={() => openEditStock(stock)} onDelete={() => void handleDeleteStock(stock)} />)}</div>}
          <div className="table-note stock-table-note"><Info size={15} /> 市值 = 持有股數 × 現價 × 匯率；自動價格來自第三方公開行情，可能延遲或暫時無法使用。</div>
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
          <div className="table-note"><Info size={15} /> 房產以你輸入的目前估值計入總資產；房貸剩餘本金請到「一般負債／房貸」管理。</div>
        </section>
      )}

      {stockModalOpen && <Modal title={editingStock ? '編輯股票資產' : '新增股票資產'} description="持股資料只存這台裝置；查價時只送股票代號給公開行情服務，台股會同步帶入中文名稱與配息資料。" onClose={() => setStockModalOpen(false)}>
        <form className="asset-form" onSubmit={(event) => void handleStockSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="股票代號"><input required value={stockDraft.symbol} onChange={(event) => { const symbol = event.target.value.toUpperCase(); setStockDraft((current) => symbol === current.symbol ? { ...current, symbol } : { ...clearDividendMetadata(current), symbol, name: '', currentPrice: 0, currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined, estimatedAnnualDividendPerShare: 0, estimatedYieldPercent: 0 }); setQuoteState({ status: 'idle', message: '輸入代號後離開欄位，會自動查詢行情、中文名稱與配息；批次更新請使用頁面上方按鈕。', quote: null }) }} onBlur={() => { if (stockDraft.symbol.trim()) void refreshStockQuote() }} placeholder={stockDraft.market === 'US' ? '例如 AAPL、TSLA 或 BRK.B' : stockDraft.market === 'TW' ? '例如 00878' : '例如股票代號'} /></FormField>
            <FormField label="股票名稱" hint={stockDraft.market === 'TW' ? '台股自動帶入中文' : undefined}><input required value={stockDraft.name} onChange={(event) => setStockDraft((current) => ({ ...current, name: event.target.value }))} placeholder={stockDraft.market === 'TW' ? '自動帶入或例如 國泰永續高股息' : '自動帶入或手動輸入'} /></FormField>
            <FormField label="市場"><div className="select-wrap"><select value={stockDraft.market} onChange={(event) => { const market = event.target.value as Market; setStockDraft((current) => ({ ...clearDividendMetadata(current), market, name: '', currentPrice: 0, currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined, currency: market === 'TW' ? 'TWD' : market === 'US' ? 'USD' : current.currency, exchangeRateToTwd: market === 'TW' ? 1 : current.exchangeRateToTwd })); setQuoteState({ status: 'idle', message: market === 'OTHER' ? '其他市場目前請手動輸入股價與名稱。' : market === 'US' ? '美股可輸入 AAPL、TSLA、BRK.B；離開代號欄位後會自動查詢行情與配息。' : '輸入代號後離開欄位，會自動查詢行情與名稱；價格也可以手動輸入。', quote: null }) }}><option value="TW">台股</option><option value="US">美股</option><option value="OTHER">其他</option></select><SelectChevron /></div></FormField>
            <FormField label="幣別"><div className="select-wrap"><select value={stockDraft.currency} onChange={(event) => setStockDraft((current) => ({ ...current, currency: event.target.value as Currency, exchangeRateToTwd: event.target.value === 'TWD' ? 1 : current.exchangeRateToTwd }))}><option value="TWD">TWD / 新台幣</option><option value="USD">USD / 美元</option></select><SelectChevron /></div></FormField>
            <FormField label="持有股數"><input required min="0" step="any" type="number" value={stockDraft.shares || ''} onChange={(event) => setStockDraft((current) => ({ ...current, shares: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="平均成本" hint={`/${stockDraft.currency}`}><input required min="0" step="any" type="number" value={stockDraft.averageCost || ''} onChange={(event) => setStockDraft((current) => ({ ...current, averageCost: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="目前股價" hint={`/${stockDraft.currency}`}><input required min="0" step="any" type="number" value={stockDraft.currentPrice || ''} onChange={(event) => { const currentPrice = Number(event.target.value); setStockDraft((current) => ({ ...current, currentPrice, currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined, estimatedYieldPercent: current.dividendSource === 'yahoo-public' && currentPrice > 0 ? current.estimatedAnnualDividendPerShare / currentPrice * 100 : current.estimatedYieldPercent })); setQuoteState({ status: 'idle', message: '目前價格已改為手動輸入；殖利率會依自動配息資料重新換算。', quote: null }) }} placeholder="自動帶入或手動輸入" /></FormField>
            <FormField label="匯率" hint="換算 TWD"><input required min="0.0001" step="any" type="number" value={stockDraft.exchangeRateToTwd} disabled={stockDraft.currency === 'TWD'} onChange={(event) => setStockDraft((current) => ({ ...current, exchangeRateToTwd: Number(event.target.value) }))} /></FormField>
            <FormField label="年度每股配息" hint={`/${stockDraft.currency}`}><input min="0" step="any" type="number" value={stockDraft.estimatedAnnualDividendPerShare || ''} onChange={(event) => updateManualDividend(Number(event.target.value))} placeholder="自動帶入或手動輸入" /></FormField>
            <FormField label="預估殖利率" hint="%"><input min="0" step="any" type="number" value={stockDraft.estimatedYieldPercent || ''} onChange={(event) => updateManualYield(Number(event.target.value))} placeholder="自動計算或手動輸入" /></FormField>
          </div>
          <div className={`quote-status quote-status-${quoteState.status}`} role="status" aria-live="polite"><Info size={14} /><span>{quoteState.message}</span>{quoteState.status === 'success' && <small>{PUBLIC_QUOTE_PROVIDER_LABEL}</small>}</div>
          {stockDraft.dividendSource === 'yahoo-public' && <div className="dividend-auto-note" role="status"><Info size={14} /><span>自動配息：{dividendPeriodLabel(stockDraft.dividendPeriod)} {stockDraft.dividendPeriodStart}～{stockDraft.dividendPeriodEnd}，年配息 {dividendCurrency(stockDraft)}{formatNumber(stockDraft.estimatedAnnualDividendPerShare, 2)}，年化殖利率 {formatPercent(stockDraft.estimatedYieldPercent)}。</span></div>}
          <label className="checkbox-field"><input type="checkbox" checked={stockDraft.asCollateral} onChange={(event) => setStockDraft((current) => ({ ...current, asCollateral: event.target.checked }))} /><span className="custom-checkbox"><Check size={13} /></span><span>標記為未來可用的質押擔保品</span></label>
          <FormField label="備註" wide><textarea value={stockDraft.notes} onChange={(event) => setStockDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如：價格更新日期、資料來源或自己的備註" rows={3} /></FormField>
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setStockModalOpen(false)}>取消</button><button type="submit" className="button button-primary"><Check size={16} />儲存股票</button></div>
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
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setCashModalOpen(false)}>取消</button><button type="submit" className="button button-primary"><Check size={16} />儲存現金</button></div>
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
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setRealEstateModalOpen(false)}>取消</button><button type="submit" className="button button-primary"><Check size={16} />儲存房產</button></div>
        </form>
      </Modal>}
    </div>
  )
}

function BarChartGlyph() {
  return <span className="mini-bars" aria-hidden="true"><i /><i /><i /></span>
}
