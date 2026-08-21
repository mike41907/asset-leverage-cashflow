import { useRef, useState, type FormEvent } from 'react'
import {
  Banknote,
  Check,
  ChevronDown,
  Edit3,
  Info,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import type { CashAsset, Currency, Market, StockAsset } from '../domain/models'
import { calculateCashValue, calculateStockMarketValue, calculateStockUnrealizedGain, calculateStockUnrealizedGainPercent } from '../domain/calculations'
import { formatCurrencyWithSign, formatNumber, formatPercent, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'
import { EmptyState } from '../components/EmptyState'
import { fetchStockQuote, PUBLIC_QUOTE_PROVIDER_LABEL, type StockQuote } from '../services/quoteService'

interface AssetsPageProps {
  stocks: StockAsset[]
  cash: CashAsset[]
  displayMode: 'exact' | 'compact'
  onSaveStock: (stock: StockAsset) => Promise<void>
  onDeleteStock: (id: string) => Promise<void>
  onSaveCash: (cash: CashAsset) => Promise<void>
  onDeleteCash: (id: string) => Promise<void>
}

type AssetTab = 'stocks' | 'cash'
type StockDraft = Omit<StockAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>
type CashDraft = Omit<CashAsset, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'isDemo'>

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
  message: '輸入代號後離開欄位，會自動查詢公開行情；也可以手動更新。',
  quote: null,
}

const defaultCashDraft: CashDraft = {
  label: '',
  currency: 'TWD',
  amount: 0,
  exchangeRateToTwd: 1,
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

export function AssetsPage({ stocks, cash, displayMode, onSaveStock, onDeleteStock, onSaveCash, onDeleteCash }: AssetsPageProps) {
  const [activeTab, setActiveTab] = useState<AssetTab>('stocks')
  const [search, setSearch] = useState('')
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [cashModalOpen, setCashModalOpen] = useState(false)
  const [editingStock, setEditingStock] = useState<StockAsset | null>(null)
  const [editingCash, setEditingCash] = useState<CashAsset | null>(null)
  const [stockDraft, setStockDraft] = useState<StockDraft>(defaultStockDraft)
  const [cashDraft, setCashDraft] = useState<CashDraft>(defaultCashDraft)
  const [quoteState, setQuoteState] = useState<QuoteState>(initialQuoteState)
  const [refreshingStockId, setRefreshingStockId] = useState<string | null>(null)
  const [quoteListNotice, setQuoteListNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const quoteRequestId = useRef(0)

  const filteredStocks = stocks.filter((stock) => `${stock.symbol} ${stock.name}`.toLowerCase().includes(search.toLowerCase()))
  const filteredCash = cash.filter((item) => `${item.label} ${item.currency}`.toLowerCase().includes(search.toLowerCase()))

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
      message: '可按「更新行情」重新抓取；原有價格會保留到你確認更新為止。',
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

  const refreshStockQuote = async (): Promise<StockQuote | null> => {
    const requestId = ++quoteRequestId.current
    const requestedSymbol = stockDraft.symbol.trim()
    if (!requestedSymbol) {
      setQuoteState({ status: 'error', message: '請先輸入股票代號，再更新行情。', quote: null })
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
        name: current.name.trim() ? current.name : quote.name,
        currency: current.market === 'TW' ? 'TWD' : current.market === 'US' ? 'USD' : current.currency,
      }))
      setQuoteState({
        status: 'success',
        message: `已取得 ${quote.yahooSymbol}：${quote.currency === 'USD' ? '$' : 'NT$'}${formatNumber(quote.price, 2)} · 行情時間 ${formatQuoteTime(quote.marketAt)}`,
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
          name: draftToSave.name.trim() ? draftToSave.name : quote.name,
          currency: quote.currency,
          exchangeRateToTwd: quote.currency === 'TWD' ? 1 : draftToSave.exchangeRateToTwd,
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

  const handleRefreshSavedStock = async (stock: StockAsset) => {
    setRefreshingStockId(stock.id)
    setQuoteListNotice(null)
    try {
      const quote = await fetchStockQuote(stock.symbol, stock.market)
      await onSaveStock({
        ...stock,
        currentPrice: quote.price,
        currentPriceSource: 'yahoo-public',
        currentPriceFetchedAt: quote.fetchedAt,
        currentPriceMarketAt: quote.marketAt ?? undefined,
        currency: quote.currency,
        exchangeRateToTwd: quote.currency === 'TWD' ? 1 : stock.exchangeRateToTwd,
        updatedAt: new Date().toISOString(),
      })
      setQuoteListNotice({ kind: 'success', message: `${stock.symbol} 已更新為 ${quote.currency === 'USD' ? '$' : 'NT$'}${formatNumber(quote.price, 2)}。` })
    } catch (error) {
      setQuoteListNotice({ kind: 'error', message: `${stock.symbol}：${getQuoteErrorMessage(error)}` })
    } finally {
      setRefreshingStockId(null)
    }
  }

  const handleDeleteStock = async (stock: StockAsset) => {
    if (window.confirm(`確定要刪除 ${stock.symbol} 嗎？`)) await onDeleteStock(stock.id)
  }

  const handleDeleteCash = async (item: CashAsset) => {
    if (window.confirm(`確定要刪除「${item.label}」嗎？`)) await onDeleteCash(item.id)
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
          <button type="button" className="button button-primary" onClick={activeTab === 'stocks' ? openNewStock : openNewCash}><Plus size={17} />新增{activeTab === 'stocks' ? '股票' : '現金'}</button>
        </div>
      </section>

      <section className="asset-toolbar card">
        <div className="segmented-control" role="tablist" aria-label="資產類型">
          <button type="button" role="tab" aria-selected={activeTab === 'stocks'} className={activeTab === 'stocks' ? 'is-active' : ''} onClick={() => { setActiveTab('stocks'); setSearch('') }}><BarChartGlyph />股票 <span>{stocks.length}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'cash'} className={activeTab === 'cash' ? 'is-active' : ''} onClick={() => { setActiveTab('cash'); setSearch('') }}><Banknote size={16} />現金 <span>{cash.length}</span></button>
        </div>
        <label className="search-field"><Search size={17} /><span className="sr-only">搜尋資產</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === 'stocks' ? '搜尋代號或名稱' : '搜尋現金帳戶'} /></label>
      </section>

      {activeTab === 'stocks' ? (
        <section className="card asset-table-card">
          <div className="section-heading-row asset-section-heading">
            <div><div className="section-kicker">股票 / ETF</div><h2>持倉清單</h2></div>
            <span className="section-caption">公開行情＋手動備援</span>
          </div>
          {quoteListNotice && <div className={`quote-list-notice quote-list-notice-${quoteListNotice.kind}`} role={quoteListNotice.kind === 'error' ? 'alert' : 'status'}><Info size={14} />{quoteListNotice.message}</div>}
          {filteredStocks.length === 0 ? (
            <EmptyState icon={WalletCards} title={search ? '找不到符合的持倉' : '還沒有股票資產'} description={search ? '換一個代號或名稱試試。' : '輸入第一筆股票，首頁就會開始計算總資產。'} actionLabel={search ? undefined : '新增股票'} onAction={search ? undefined : openNewStock} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>股票</th><th>持有股數</th><th>現價</th><th>市值</th><th>未實現損益</th><th>質押擔保</th><th aria-label="操作" /></tr></thead>
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
                      <td data-label="質押擔保"><span className={`collateral-tag ${stock.asCollateral ? 'is-on' : ''}`}>{stock.asCollateral ? <><Check size={13} />是</> : '否'}</span></td>
                      <td className="row-actions"><button type="button" className="icon-button small" aria-label={`更新 ${stock.symbol} 股價`} title="更新股價" disabled={refreshingStockId === stock.id || stock.market === 'OTHER'} onClick={() => void handleRefreshSavedStock(stock)}>{refreshingStockId === stock.id ? <RefreshCw className="spin-icon" size={15} /> : <RefreshCw size={15} />}</button><button type="button" className="icon-button small" aria-label={`編輯 ${stock.symbol}`} title="編輯" onClick={() => openEditStock(stock)}><Edit3 size={15} /></button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${stock.symbol}`} title="刪除" onClick={() => void handleDeleteStock(stock)}><Trash2 size={15} /></button></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-note"><Info size={15} /> 市值 = 持有股數 × 現價 × 匯率；自動價格來自第三方公開行情，可能延遲或暫時無法使用。</div>
        </section>
      ) : (
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
      )}

      {stockModalOpen && <Modal title={editingStock ? '編輯股票資產' : '新增股票資產'} description="持股資料只存這台裝置；查價時只送股票代號給公開行情服務。" onClose={() => setStockModalOpen(false)}>
        <form className="asset-form" onSubmit={(event) => void handleStockSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="股票代號"><input required value={stockDraft.symbol} onChange={(event) => { setStockDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase(), currentPriceSource: current.symbol === event.target.value.toUpperCase() ? current.currentPriceSource : 'manual', currentPriceFetchedAt: current.symbol === event.target.value.toUpperCase() ? current.currentPriceFetchedAt : undefined, currentPriceMarketAt: current.symbol === event.target.value.toUpperCase() ? current.currentPriceMarketAt : undefined })); setQuoteState({ status: 'idle', message: '輸入代號後離開欄位，會自動查詢公開行情；也可以手動更新。', quote: null }) }} onBlur={() => { if (stockDraft.symbol.trim()) void refreshStockQuote() }} placeholder="例如 00878" /></FormField>
            <FormField label="股票名稱"><input required value={stockDraft.name} onChange={(event) => setStockDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 國泰永續高股息" /></FormField>
            <FormField label="市場"><div className="select-wrap"><select value={stockDraft.market} onChange={(event) => { const market = event.target.value as Market; setStockDraft((current) => ({ ...current, market, currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined })); setQuoteState({ status: 'idle', message: market === 'OTHER' ? '其他市場目前請手動輸入股價。' : '輸入代號後離開欄位，會自動查詢公開行情；也可以手動更新。', quote: null }) }}><option value="TW">台股</option><option value="US">美股</option><option value="OTHER">其他</option></select><SelectChevron /></div></FormField>
            <FormField label="幣別"><div className="select-wrap"><select value={stockDraft.currency} onChange={(event) => setStockDraft((current) => ({ ...current, currency: event.target.value as Currency, exchangeRateToTwd: event.target.value === 'TWD' ? 1 : current.exchangeRateToTwd }))}><option value="TWD">TWD / 新台幣</option><option value="USD">USD / 美元</option></select><SelectChevron /></div></FormField>
            <FormField label="持有股數"><input required min="0" step="any" type="number" value={stockDraft.shares || ''} onChange={(event) => setStockDraft((current) => ({ ...current, shares: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="平均成本" hint={`/${stockDraft.currency}`}><input required min="0" step="any" type="number" value={stockDraft.averageCost || ''} onChange={(event) => setStockDraft((current) => ({ ...current, averageCost: Number(event.target.value) }))} placeholder="0" /></FormField>
            <div className="quote-control"><FormField label="目前股價" hint={`/${stockDraft.currency}`}><input required min="0" step="any" type="number" value={stockDraft.currentPrice || ''} onChange={(event) => { setStockDraft((current) => ({ ...current, currentPrice: Number(event.target.value), currentPriceSource: 'manual', currentPriceFetchedAt: undefined, currentPriceMarketAt: undefined })); setQuoteState({ status: 'idle', message: '目前價格已改為手動輸入；如需最新值請更新行情。', quote: null }) }} placeholder="自動帶入或手動輸入" /></FormField><button type="button" className="button button-secondary quote-refresh-button" disabled={quoteState.status === 'loading' || stockDraft.market === 'OTHER' || !stockDraft.symbol.trim()} onClick={() => void refreshStockQuote()}><RefreshCw className={quoteState.status === 'loading' ? 'spin-icon' : undefined} size={14} />{quoteState.status === 'loading' ? '查詢中' : '更新行情'}</button></div>
            <FormField label="匯率" hint="換算 TWD"><input required min="0.0001" step="any" type="number" value={stockDraft.exchangeRateToTwd} disabled={stockDraft.currency === 'TWD'} onChange={(event) => setStockDraft((current) => ({ ...current, exchangeRateToTwd: Number(event.target.value) }))} /></FormField>
            <FormField label="年度每股配息" hint={`/${stockDraft.currency}`}><input min="0" step="any" type="number" value={stockDraft.estimatedAnnualDividendPerShare || ''} onChange={(event) => setStockDraft((current) => ({ ...current, estimatedAnnualDividendPerShare: Number(event.target.value) }))} placeholder="可留空" /></FormField>
            <FormField label="預估殖利率" hint="%"><input min="0" step="any" type="number" value={stockDraft.estimatedYieldPercent || ''} onChange={(event) => setStockDraft((current) => ({ ...current, estimatedYieldPercent: Number(event.target.value) }))} placeholder="例如 5" /></FormField>
          </div>
          <div className={`quote-status quote-status-${quoteState.status}`} role="status" aria-live="polite"><Info size={14} /><span>{quoteState.message}</span>{quoteState.status === 'success' && <small>{PUBLIC_QUOTE_PROVIDER_LABEL}</small>}</div>
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
    </div>
  )
}

function BarChartGlyph() {
  return <span className="mini-bars" aria-hidden="true"><i /><i /><i /></span>
}
