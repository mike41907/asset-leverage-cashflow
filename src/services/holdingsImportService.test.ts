import { describe, expect, it } from 'vitest'
import { parseHoldingScreenshotText } from './holdingsImportService'

describe('holdings screenshot import parser', () => {
  it('extracts Taiwan and US holdings from labeled broker text', () => {
    const candidates = parseHoldingScreenshotText(`
      持倉清單
      00685L Capital Taiex Daily Leveraged 2X ETF
      持有股數 6,000
      平均成本 NT$10.71
      現價 NT$11.37
      市值 NT$68,220
      未實現損益 +NT$3,960 6.2%
      AAPL Apple Inc.
      Shares 10
      Avg Cost $180.00
      Market Price $210.00
      Unrealized P&L +$300.00 16.67%
    `, 'broker.png')

    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({
      symbol: '00685L',
      name: 'Capital Taiex Daily Leveraged 2X ETF',
      market: 'TW',
      currency: 'TWD',
      shares: 6000,
      averageCost: 10.71,
      currentPrice: 11.37,
      reportedGain: 3960,
      reportedGainPercent: 6.2,
      confidence: 'high',
      selected: true,
    })
    expect(candidates[1]).toMatchObject({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      market: 'US',
      currency: 'USD',
      shares: 10,
      averageCost: 180,
      currentPrice: 210,
      reportedGain: 300,
      reportedGainPercent: 16.67,
      confidence: 'high',
      selected: true,
    })
  })

  it('derives per-share values when the screenshot only has totals', () => {
    const [candidate] = parseHoldingScreenshotText(`
      BRK.B Berkshire Hathaway Class B
      Qty 4
      Cost Basis $1,600
      Market Value $2,000
      Unrealized P&L +$400
    `, 'us-broker.png')

    expect(candidate).toMatchObject({
      symbol: 'BRK.B',
      market: 'US',
      shares: 4,
      averageCost: 400,
      currentPrice: 500,
      reportedGain: 400,
    })
    expect(candidate.warnings).toEqual(expect.arrayContaining([
      '目前價格由市值或損益推算',
      '平均成本由總成本除以股數推算',
    ]))
  })

  it('leaves incomplete rows unselected for manual review', () => {
    const [candidate] = parseHoldingScreenshotText('TSLA Tesla Inc.\nShares 8', 'partial.png')

    expect(candidate).toMatchObject({ symbol: 'TSLA', shares: 8, averageCost: null, currentPrice: null, selected: true, confidence: 'low' })
    expect(candidate.warnings).toEqual(expect.arrayContaining(['找不到平均成本', '找不到目前價格']))
  })

  it('parses a mobile broker row with unlabeled shares, price, and market value', () => {
    const candidates = parseHoldingScreenshotText(`
      AAOI
      8 股
      $143.94 $1,151.54
      CPNG
      75 股
      $27.42 $2,056.83
      NVDA
      78.25928 股
      $61.42 $4,806.36
      ONDS
      100 股
      $8.33 $832.50
      PLTR
      1 股
      $141.87 $141.87
    `, 'mobile-broker.jpg')

    expect(candidates).toHaveLength(5)
    expect(candidates[0]).toMatchObject({
      symbol: 'AAOI',
      name: 'AAOI',
      shares: 8,
      averageCost: null,
      currentPrice: 143.94,
      reportedGain: null,
      selected: true,
    })
    expect(candidates[1]).toMatchObject({ symbol: 'CPNG', shares: 75, currentPrice: 27.42 })
    expect(candidates[2]).toMatchObject({ symbol: 'NVDA', shares: 78.25928, currentPrice: 61.42 })
    expect(candidates[0].warnings).toEqual(expect.arrayContaining(['找不到平均成本', '目前價格由持倉列辨識，加入時會自動更新']))
  })

  it('falls back to a plain numeric quantity when OCR drops the shares label', () => {
    const [candidate] = parseHoldingScreenshotText(`
      SOUN
      200
      10.70 2,140.30
    `, 'ocr-drop-share-label.png')

    expect(candidate).toMatchObject({ symbol: 'SOUN', shares: 200, currentPrice: 10.7, selected: true })
  })

  it('recognizes COST while ignoring cost field labels', () => {
    const [candidate] = parseHoldingScreenshotText(`
      COST Costco Wholesale
      Shares 2
      Avg Cost $700.00
      Market Price $800.00
    `, 'costco.png')

    expect(candidate).toMatchObject({ symbol: 'COST', name: 'Costco Wholesale', market: 'US', shares: 2, averageCost: 700, currentPrice: 800, selected: true })
  })
})
