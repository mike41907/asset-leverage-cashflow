import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchStockQuote, hasChineseName, normalizeYahooSymbol, parseTaiwanStockNameText, parseYahooChartPayload, parseYahooChartText } from './quoteService'

const chartPayload = {
  chart: {
    result: [{
      meta: {
        symbol: '2330.TW',
        longName: '台灣積體電路製造股份有限公司',
        currency: 'TWD',
        regularMarketPrice: 1_234.5,
        regularMarketTime: 1_725_000_000,
      },
      indicators: { quote: [{ close: [1_200, 1_234.5] }] },
    }],
  },
}

const usChartPayload = {
  chart: {
    result: [{
      meta: {
        symbol: 'AAPL',
        longName: 'Apple Inc.',
        currency: 'USD',
        regularMarketPrice: 210.25,
        regularMarketTime: 1_756_000_000,
      },
      indicators: { quote: [{ close: [209.8, 210.25] }] },
    }],
  },
}

describe('quote service', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes Taiwan and US symbols for Yahoo chart lookup', () => {
    expect(normalizeYahooSymbol('2330', 'TW')).toBe('2330.TW')
    expect(normalizeYahooSymbol('6488.two', 'TW')).toBe('6488.TWO')
    expect(normalizeYahooSymbol(' aapl ', 'US')).toBe('AAPL')
    expect(normalizeYahooSymbol('$aapl', 'US')).toBe('AAPL')
    expect(normalizeYahooSymbol('NASDAQ:AAPL.US', 'US')).toBe('AAPL')
    expect(normalizeYahooSymbol('NYSE: BRK.B', 'US')).toBe('BRK-B')
    expect(() => normalizeYahooSymbol('2330', 'OTHER')).toThrow('其他市場')
  })

  it('parses a Yahoo chart payload and keeps provider time separate from fetch time', () => {
    const quote = parseYahooChartPayload(chartPayload, '2330', 'TW', '2026-08-21T03:00:00.000Z')

    expect(quote).toMatchObject({
      symbol: '2330',
      yahooSymbol: '2330.TW',
      name: '台灣積體電路製造股份有限公司',
      price: 1_234.5,
      currency: 'TWD',
      source: 'yahoo-public',
      fetchedAt: '2026-08-21T03:00:00.000Z',
    })
    expect(quote.marketAt).toBe(new Date(1_725_000_000 * 1000).toISOString())
  })

  it('parses a US quote as USD and keeps the user-facing symbol', () => {
    const quote = parseYahooChartPayload(usChartPayload, 'AAPL', 'US', '2026-08-21T03:00:00.000Z')

    expect(quote).toMatchObject({
      symbol: 'AAPL',
      yahooSymbol: 'AAPL',
      name: 'Apple Inc.',
      price: 210.25,
      currency: 'USD',
      source: 'yahoo-public',
    })
  })

  it('uses trailing twelve-month dividends to calculate the annual per-share amount', () => {
    const fetchedAt = '2026-08-21T00:00:00.000Z'
    const payload = {
      chart: {
        result: [{
          ...chartPayload.chart.result[0],
          events: {
            dividends: {
              '2025-09-01': { amount: 1, date: Date.parse('2025-09-01T00:00:00.000Z') / 1000 },
              '2026-03-01': { amount: 0.5, date: Date.parse('2026-03-01T00:00:00.000Z') / 1000 },
              '2026-08-01': { amount: 0.8, date: Date.parse('2026-08-01T00:00:00.000Z') / 1000 },
              '2024-12-01': { amount: 10, date: Date.parse('2024-12-01T00:00:00.000Z') / 1000 },
            },
          },
        }],
      },
    }

    const quote = parseYahooChartPayload(payload, '00878', 'TW', fetchedAt)

    expect(quote.dividend).toEqual({
      annualDividendPerShare: 2.3,
      period: 'trailing-12-months',
      periodStart: '2025-08-21',
      periodEnd: '2026-08-21',
      paymentCount: 3,
    })
  })

  it('falls back to the previous complete calendar year when trailing dividends are unavailable', () => {
    const payload = {
      chart: {
        result: [{
          ...chartPayload.chart.result[0],
          events: {
            dividends: {
              '2025-02-01': { amount: 1.2, date: Date.parse('2025-02-01T00:00:00.000Z') / 1000 },
              '2025-08-01': { amount: 0.8, date: Date.parse('2025-08-01T00:00:00.000Z') / 1000 },
              '2024-12-01': { amount: 10, date: Date.parse('2024-12-01T00:00:00.000Z') / 1000 },
            },
          },
        }],
      },
    }

    const quote = parseYahooChartPayload(payload, '00878', 'TW', '2026-08-21T00:00:00.000Z')

    expect(quote.dividend).toEqual({
      annualDividendPerShare: 2,
      period: 'previous-calendar-year',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      paymentCount: 2,
    })
  })

  it('extracts JSON when the public reader prefixes the provider response with text', () => {
    const quote = parseYahooChartText(`Title:\nURL Source: https://example.invalid\nMarkdown Content:\n${JSON.stringify(chartPayload)}`, '2330', 'TW', '2026-08-21T03:00:00.000Z')
    expect(quote.price).toBe(1_234.5)
  })

  it('extracts a Chinese Taiwan stock name from the public Yahoo Taiwan page', () => {
    const name = parseTaiwanStockNameText('Title: 台積電(2330.TW) 走勢圖 - Yahoo股市\n\n# Yahoo股市\n\n# 台積電\n2330', '2330')

    expect(name).toBe('台積電')
    expect(hasChineseName(name ?? '')).toBe(true)
  })

  it('uses the optional Taiwan page lookup when the chart metadata is English', async () => {
    const englishChartPayload = {
      ...chartPayload,
      chart: {
        ...chartPayload.chart,
        result: [{
          ...chartPayload.chart.result[0],
          meta: { ...chartPayload.chart.result[0].meta, longName: 'Taiwan Semiconductor Manufacturing Company Limited' },
        }],
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(englishChartPayload) })
      .mockResolvedValueOnce({ ok: true, text: async () => 'Title: 台積電(2330.TW) 走勢圖 - Yahoo股市\n\n# 台積電' })
    vi.stubGlobal('fetch', fetchMock)

    const quote = await fetchStockQuote('2330', 'TW')

    expect(quote.name).toBe('台積電')
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('https://r.jina.ai/http://tw.stock.yahoo.com/quote/2330.TW'), expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('uses the public reader endpoint and returns a parsed quote', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(chartPayload),
    })
    vi.stubGlobal('fetch', fetchMock)

    const quote = await fetchStockQuote('2330', 'TW')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://r.jina.ai/http://query1.finance.yahoo.com/v8/finance/chart/2330.TW'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchMock.mock.calls[0][0]).toContain('range=2y')
    expect(fetchMock.mock.calls[0][0]).toContain('events=div%2Csplits')
    expect(quote.price).toBe(1_234.5)
  })

  it('converts US share-class symbols before requesting the public reader endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...usChartPayload,
        chart: {
          ...usChartPayload.chart,
          result: [{
            ...usChartPayload.chart.result[0],
            meta: { ...usChartPayload.chart.result[0].meta, symbol: 'BRK-B', longName: 'Berkshire Hathaway Inc. Class B' },
          }],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const quote = await fetchStockQuote('brk.b', 'US')

    expect(fetchMock.mock.calls[0][0]).toContain('/BRK-B?')
    expect(quote).toMatchObject({ symbol: 'BRK.B', yahooSymbol: 'BRK-B', currency: 'USD' })
  })
})
