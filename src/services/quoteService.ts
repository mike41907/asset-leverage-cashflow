import type { Currency, Market, StockDividendPeriod } from '../domain/models'

export const PUBLIC_QUOTE_PROVIDER_LABEL = 'Yahoo Finance 公開行情'
export const PUBLIC_QUOTE_PROXY_LABEL = '透過 Jina 公開讀取代理'

const YAHOO_CHART_BASE_URL = 'http://query1.finance.yahoo.com/v8/finance/chart'
const TAIWAN_YAHOO_QUOTE_BASE_URL = 'http://tw.stock.yahoo.com/quote'
const JINA_READER_BASE_URL = 'https://r.jina.ai/'
const YAHOO_CHART_QUERY = '?interval=1d%26range=2y%26includePrePost=false%26events=div%2Csplits'
const REQUEST_TIMEOUT_MS = 10_000
const CHINESE_NAME_TIMEOUT_MS = 15_000

export interface StockDividendQuote {
  annualDividendPerShare: number
  period: StockDividendPeriod
  periodStart: string
  periodEnd: string
  paymentCount: number
}

export interface StockQuote {
  symbol: string
  yahooSymbol: string
  name: string
  price: number
  currency: Currency
  marketAt: string | null
  fetchedAt: string
  source: 'yahoo-public'
  dividend: StockDividendQuote | null
}

export interface UsdTwdExchangeRate {
  pair: 'USD/TWD'
  rate: number
  marketAt: string | null
  fetchedAt: string
  source: 'yahoo-public'
}

interface YahooChartResult {
  meta?: Record<string, unknown>
  indicators?: {
    quote?: Array<{
      close?: unknown
    }>
  }
  events?: {
    dividends?: Record<string, {
      amount?: unknown
      date?: unknown
    }>
  }
}

interface YahooChartPayload {
  chart?: {
    result?: YahooChartResult[] | null
    error?: {
      description?: string | null
    } | null
  }
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function lastFinitePositiveNumber(value: unknown): number | null {
  if (!Array.isArray(value)) return null
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (isFinitePositiveNumber(value[index])) return value[index]
  }
  return null
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function hasChineseName(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value)
}

function getMarketCurrency(market: Market, providerCurrency: unknown): Currency {
  if (market === 'TW') return 'TWD'
  if (market === 'US') return 'USD'
  if (providerCurrency === 'TWD') return 'TWD'
  return 'USD'
}

const US_EXCHANGE_PREFIX_PATTERN = /^(?:US|NASDAQ(?:GS|GM|CM)?|NYSE(?:ARCA)?|AMEX|ARCA|OTC)\s*[:/]\s*/i
const US_MARKET_SUFFIX_PATTERN = /(?:[.:/-]|\s+)US$/i

function normalizeUsYahooSymbol(symbol: string): string {
  const decorated = symbol.trim().toUpperCase()
  const withoutExchange = decorated
    .replace(/^\$\s*/, '')
    .replace(US_EXCHANGE_PREFIX_PATTERN, '')
    .replace(US_MARKET_SUFFIX_PATTERN, '')
  return withoutExchange.replace(/\s+/g, '').replace(/[./]/g, '-')
}

export function normalizeYahooSymbol(symbol: string, market: Market): string {
  const normalized = symbol.trim().toUpperCase().replace(/\s+/g, '')
  if (!normalized) throw new Error('請先輸入股票代號。')
  if (market === 'OTHER') throw new Error('其他市場目前請手動輸入股價。')
  if (market === 'TW') {
    if (normalized.endsWith('.TW') || normalized.endsWith('.TWO')) return normalized
    return `${normalized}.TW`
  }
  const yahooSymbol = normalizeUsYahooSymbol(symbol)
  if (!yahooSymbol) throw new Error('請先輸入股票代號。')
  return yahooSymbol
}

function readProviderTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const date = new Date(value * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function firstObject<T>(value: unknown): T | null {
  return value && typeof value === 'object' ? value as T : null
}

function readEventTimestamp(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
}

function dateOnly(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

function sumDividendEvents(events: Array<{ amount: number; timestamp: number }>): number {
  return Number(events.reduce((total, event) => total + event.amount, 0).toFixed(6))
}

export function parseYahooDividendEvents(result: unknown, asOf = new Date()): StockDividendQuote | null {
  const chartResult = firstObject<YahooChartResult>(result)
  const dividends = chartResult?.events?.dividends
  if (!dividends) return null

  const asOfTime = asOf.getTime()
  if (!Number.isFinite(asOfTime)) return null
  const dividendEvents = Object.values(dividends).flatMap((event) => {
    const amount = typeof event.amount === 'number' ? event.amount : Number(event.amount)
    const timestamp = readEventTimestamp(event.date)
    return Number.isFinite(amount) && amount > 0 && timestamp !== null && timestamp <= asOfTime
      ? [{ amount, timestamp }]
      : []
  })
  if (dividendEvents.length === 0) return null

  const trailingStart = asOfTime - 365 * 24 * 60 * 60 * 1000
  const trailingEvents = dividendEvents.filter((event) => event.timestamp >= trailingStart)
  if (trailingEvents.length > 0) {
    return {
      annualDividendPerShare: sumDividendEvents(trailingEvents),
      period: 'trailing-12-months',
      periodStart: dateOnly(trailingStart),
      periodEnd: dateOnly(asOfTime),
      paymentCount: trailingEvents.length,
    }
  }

  const asOfYear = new Date(asOfTime).getUTCFullYear()
  const previousYearStart = Date.UTC(asOfYear - 1, 0, 1)
  const currentYearStart = Date.UTC(asOfYear, 0, 1)
  const previousYearEvents = dividendEvents.filter((event) => event.timestamp >= previousYearStart && event.timestamp < currentYearStart)
  if (previousYearEvents.length === 0) return null

  return {
    annualDividendPerShare: sumDividendEvents(previousYearEvents),
    period: 'previous-calendar-year',
    periodStart: dateOnly(previousYearStart),
    periodEnd: dateOnly(currentYearStart - 1),
    paymentCount: previousYearEvents.length,
  }
}

export function parseYahooChartPayload(
  payload: unknown,
  requestedSymbol: string,
  market: Market,
  fetchedAt = new Date().toISOString(),
): StockQuote {
  const root = firstObject<YahooChartPayload>(payload)
  const chart = firstObject<NonNullable<YahooChartPayload['chart']>>(root?.chart)
  const result = chart?.result?.[0]
  const meta = firstObject<Record<string, unknown>>(result?.meta)
  if (!result || !meta) {
    const providerMessage = getString(chart?.error?.description)
    throw new Error(providerMessage || '公開行情沒有回傳可用資料。')
  }

  const metaPrice = [meta.regularMarketPrice, meta.postMarketPrice, meta.preMarketPrice].find(isFinitePositiveNumber)
  const closePrice = lastFinitePositiveNumber(result.indicators?.quote?.[0]?.close)
  const price = metaPrice ?? closePrice
  if (!price) throw new Error('找不到這個代號的最新價格，請確認市場與代號。')

  const yahooSymbol = getString(meta.symbol) || normalizeYahooSymbol(requestedSymbol, market)
  const providerCurrency = getString(meta.currency)
  return {
    symbol: requestedSymbol.trim().toUpperCase(),
    yahooSymbol,
    name: getString(meta.longName) || getString(meta.shortName) || yahooSymbol,
    price,
    currency: getMarketCurrency(market, providerCurrency),
    marketAt: readProviderTimestamp(meta.regularMarketTime),
    fetchedAt,
    source: 'yahoo-public',
    dividend: parseYahooDividendEvents(result, new Date(fetchedAt)),
  }
}

export function parseYahooChartText(
  text: string,
  requestedSymbol: string,
  market: Market,
  fetchedAt = new Date().toISOString(),
): StockQuote {
  const trimmed = text.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('公開行情回應格式無法辨識。')

  try {
    return parseYahooChartPayload(JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown, requestedSymbol, market, fetchedAt)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('公開行情回應格式無法辨識。')
    throw error
  }
}

export function parseTaiwanStockNameText(text: string, requestedSymbol: string): string | null {
  const normalizedSymbol = requestedSymbol.trim().toUpperCase().replace(/\s+/g, '').replace(/\.(TW|TWO)$/i, '')
  if (!normalizedSymbol) return null
  const escapedSymbol = normalizedSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const titleMatch = text.match(new RegExp(`^Title:\\s*(.*?)\\(\\s*${escapedSymbol}\\.(?:TW|TWO)\\s*\\)`, 'im'))
  const titleName = titleMatch?.[1]?.trim()
  if (titleName && hasChineseName(titleName)) return titleName

  const headingMatch = text.match(/^#\s+(.+)$/m)
  const headingName = headingMatch?.[1]?.trim()
  if (headingName && headingName !== 'Yahoo股市' && hasChineseName(headingName)) return headingName
  return null
}

function createProxyUrl(yahooSymbol: string): string {
  const target = `${YAHOO_CHART_BASE_URL}/${yahooSymbol}${YAHOO_CHART_QUERY}`
  return `${JINA_READER_BASE_URL}${target}`
}

function createTaiwanNameProxyUrl(yahooSymbol: string): string {
  return `${JINA_READER_BASE_URL}${TAIWAN_YAHOO_QUOTE_BASE_URL}/${yahooSymbol}`
}

async function fetchTaiwanStockName(yahooSymbol: string, requestedSymbol: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), CHINESE_NAME_TIMEOUT_MS)
  try {
    const response = await fetch(createTaiwanNameProxyUrl(yahooSymbol), {
      headers: { Accept: 'text/plain, text/markdown' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return parseTaiwanStockNameText(await response.text(), requestedSymbol)
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function fetchYahooChartQuote(yahooSymbol: string, requestedSymbol: string, market: Market, fetchedAt: string): Promise<StockQuote> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(createProxyUrl(yahooSymbol), {
      headers: { Accept: 'text/plain, application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`行情服務暫時無法使用（HTTP ${response.status}）。`)
    const quote = parseYahooChartText(await response.text(), requestedSymbol, market, fetchedAt)
    if (market === 'TW' && !hasChineseName(quote.name)) {
      const chineseName = await fetchTaiwanStockName(quote.yahooSymbol, quote.symbol)
      if (chineseName) quote.name = chineseName
    }
    return quote
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('行情查詢逾時，請稍後再試或手動輸入。')
    if (error instanceof TypeError) throw new Error('目前無法連線到公開行情，請檢查網路或手動輸入。')
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function fetchUsdTwdExchangeRate(): Promise<UsdTwdExchangeRate> {
  const fetchedAt = new Date().toISOString()
  const quote = await fetchYahooChartQuote('TWD=X', 'USD/TWD', 'OTHER', fetchedAt)
  if (quote.currency !== 'TWD' || !isFinitePositiveNumber(quote.price)) {
    throw new Error('美元／台幣匯率回應格式不正確，請稍後再試。')
  }
  return {
    pair: 'USD/TWD',
    rate: quote.price,
    marketAt: quote.marketAt,
    fetchedAt: quote.fetchedAt,
    source: 'yahoo-public',
  }
}

export async function fetchStockQuote(symbol: string, market: Market): Promise<StockQuote> {
  const yahooSymbol = normalizeYahooSymbol(symbol, market)
  return fetchYahooChartQuote(yahooSymbol, symbol, market, new Date().toISOString())
}
