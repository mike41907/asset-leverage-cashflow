import type { Currency, Market } from '../domain/models'

export type HoldingImportConfidence = 'high' | 'medium' | 'low'

export interface HoldingImportCandidate {
  id: string
  sourceFileName: string
  symbol: string
  name: string
  market: Exclude<Market, 'OTHER'>
  currency: Currency
  shares: number | null
  averageCost: number | null
  currentPrice: number | null
  reportedGain: number | null
  reportedGainPercent: number | null
  confidence: HoldingImportConfidence
  selected: boolean
  warnings: string[]
  rawText: string
}

export interface OcrImageResult {
  fileName: string
  text: string
  confidence: number | null
}

export interface OcrProgress {
  currentFile: number
  totalFiles: number
  fileName: string
  percent: number
  status: string
}

interface ParsedNumber {
  value: number
  isPercent: boolean
}

interface SymbolToken {
  value: string
  index: number
  market: Exclude<Market, 'OTHER'>
}

const NUMBER_TOKEN = String.raw`(?:NT\$|US\$|\$|TWD|USD)?\s*[+\-−(]?\s*\d[\d,]*(?:\.\d+)?\s*%?\)?`
const FIELD_LABEL_PATTERN = /持有|股數|持股|數量|平均成本|均價|成本|現價|市價|股價|市值|損益|獲利|盈虧|報酬|未實現|(?:shares?|qty|quantity|average\s*cost|avg\.?\s*cost|cost\s*(?:basis|per\s*share)?|current\s*price|market\s*price|market\s*value|price|value|p\s*[&/]\s*l|unrealized|gain|profit|loss|return)\b/i
const SYMBOL_STOP_WORDS = new Set([
  'A', 'AN', 'AND', 'AVG', 'AVERAGE', 'AMEX', 'ARCA', 'BUY', 'CURRENT', 'DATE', 'DAY', 'ETF', 'GAIN',
  'HOLDING', 'HOLDINGS', 'INC', 'LOSS', 'MARKET', 'NASDAQ', 'NYSE', 'OTC', 'P', 'P&L', 'PNL', 'PRICE', 'PROFIT',
  'NT', 'QTY', 'QUANTITY', 'RETURN', 'SELL', 'SHARE', 'SHARES', 'STOCK', 'STOCKS', 'TOTAL', 'TW', 'TWD', 'USD', 'US',
  'VALUE', 'UNREALIZED', 'YEAR', 'MONTH', 'L',
])

const SHARE_LABEL = /持有(?:股數|股|數量)?|持股(?:數量)?|股數|數量|shares?|qty|quantity/i
const AVERAGE_COST_LABEL = /平均成本|平均價|均價|avg\.?\s*cost|average\s*cost|cost\s*(?:per\s*share|\/\s*share)/i
const TOTAL_COST_LABEL = /總成本|成本總額|cost\s*basis|total\s*cost|invested\s*(?:amount|value)?/i
const CURRENT_PRICE_LABEL = /現價|目前價格|市價|股價|current\s*price|market\s*price|last\s*price|price(?!\s*to\s*earnings)/i
const MARKET_VALUE_LABEL = /市值|總市值|market\s*value|market\s*val\.?/i
const GAIN_LABEL = /未實現損益|未實現盈虧|損益(?!率)|獲利|盈虧|\b(?:p\s*[&/]\s*l|pnl|unrealized|gain|profit|loss)\b/i
const GAIN_PERCENT_LABEL = /報酬率|損益率|報酬|回報率|\b(?:p\s*[&/]\s*l|pnl|gain|return)\b/i

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .replace(/[|｜]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function parseNumberToken(raw: string): ParsedNumber | null {
  const normalized = raw.trim()
  const isPercent = normalized.includes('%')
  const isNegative = /^[+\-−(]/u.test(normalized)
  const numeric = normalized.replace(/[^\d.]/g, '')
  if (!numeric) return null
  const value = Number(numeric)
  if (!Number.isFinite(value)) return null
  return { value: isNegative ? -value : value, isPercent }
}

function extractNumbers(text: string): ParsedNumber[] {
  return Array.from(text.matchAll(new RegExp(NUMBER_TOKEN, 'gi')))
    .map((match) => parseNumberToken(match[0]))
    .filter((value): value is ParsedNumber => value !== null)
}

function extractLabeledNumber(text: string, label: RegExp, wantPercent: boolean): number | null {
  const match = label.exec(text)
  if (!match || match.index === undefined) return null
  const nearbyText = text.slice(match.index + match[0].length, match.index + match[0].length + 110)
  const candidates = extractNumbers(nearbyText)
  const selected = candidates.find((candidate) => wantPercent ? candidate.isPercent : !candidate.isPercent)
  return selected?.value ?? null
}

function findSymbolTokens(line: string): SymbolToken[] {
  const tokens: SymbolToken[] = []
  const taiwanPattern = /(?<![\d.])(?:\d{4,6}[A-Z]?)(?!\d|[/.-]\d)/gi
  for (const match of line.matchAll(taiwanPattern)) {
    const value = match[0].toUpperCase()
    tokens.push({ value, index: match.index ?? 0, market: 'TW' })
  }

  const usPattern = /(?<![A-Za-z])\$?[A-Z]{1,5}(?:[.-][A-Z])?(?:\.US)?(?![A-Za-z])/g
  for (const match of line.matchAll(usPattern)) {
    const value = match[0].replace(/^\$/, '').replace(/\.US$/i, '').toUpperCase()
    const isCostFieldLabel = value === 'COST' && /(?:avg(?:erage)?|total)?\s*cost(?:\s+(?:basis|per\s+share))?\s*(?:NT\$|US\$|\$|\d)/i.test(line)
    if (!SYMBOL_STOP_WORDS.has(value.replace(/[.-]/g, '')) && !isCostFieldLabel) {
      tokens.push({ value, index: match.index ?? 0, market: 'US' })
    }
  }

  return tokens.sort((left, right) => left.index - right.index)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function looksLikeNameLine(line: string): boolean {
  if (line.length <= 1 || /[$%]/u.test(line) || !/[A-Za-z\u3400-\u9fff]/u.test(line) || FIELD_LABEL_PATTERN.test(line)) return false
  if (/^\s*[\d,]+(?:\.\d+)?\s*(?:股|shares?|qty|quantity)?\s*$/iu.test(line)) return false
  return true
}

function extractName(lines: string[], symbolToken: SymbolToken): string {
  const symbolLine = lines[0] ?? ''
  const symbolPattern = new RegExp(escapeRegExp(symbolToken.value), 'i')
  const remainder = symbolLine
    .replace(symbolPattern, ' ')
    .replace(/^[\s:：·•\-|]+|[\s:：·•\-|]+$/g, '')
    .trim()
  if (looksLikeNameLine(remainder)) return remainder

  const nameLine = lines.slice(1).find(looksLikeNameLine)
  return nameLine?.trim() ?? symbolToken.value
}

function inferMarket(symbol: SymbolToken, text: string): Exclude<Market, 'OTHER'> {
  if (symbol.market === 'TW') return 'TW'
  return /台股|上市|上櫃|TWSE|TPEX|NT\$|TWD/i.test(text) ? 'TW' : 'US'
}

function confidenceFor(shares: number | null, averageCost: number | null, currentPrice: number | null): HoldingImportConfidence {
  const completeFields = [shares, averageCost, currentPrice].filter((value) => value !== null && value > 0).length
  return completeFields === 3 ? 'high' : completeFields >= 2 ? 'medium' : 'low'
}

interface BrokerRowValues {
  shares: number | null
  currentPrice: number | null
  marketValue: number | null
}

function extractBrokerRowValues(blockLines: string[]): BrokerRowValues {
  const explicitShareLine = blockLines.find((line) => /(?:股(?!票)|shares?|qty|quantity)/iu.test(line) && extractNumbers(line).some((number) => !number.isPercent))
  const fallbackShareLine = blockLines.slice(1).find((line) => {
    const numbers = extractNumbers(line).filter((number) => !number.isPercent)
    return numbers.length === 1 && !/(?:NT\$|US\$|TWD|USD|\$)/iu.test(line) && !FIELD_LABEL_PATTERN.test(line)
  })
  const shareLine = explicitShareLine ?? fallbackShareLine
  const shares = shareLine ? extractNumbers(shareLine).find((number) => !number.isPercent)?.value ?? null : null
  const moneyLines = blockLines.filter((line) => /(?:NT\$|US\$|TWD|USD|\$)/iu.test(line) && !FIELD_LABEL_PATTERN.test(line))
  const fallbackLines = blockLines.filter((line) => !shareLine || line !== shareLine).filter((line) => !FIELD_LABEL_PATTERN.test(line) && extractNumbers(line).some((number) => !number.isPercent))
  const valueLines = moneyLines.length > 0 ? moneyLines : fallbackLines
  const values = valueLines.flatMap((line) => extractNumbers(line).filter((number) => !number.isPercent).map((number) => number.value))

  return {
    shares,
    currentPrice: values[0] ?? null,
    marketValue: values[1] ?? null,
  }
}

function createWarnings(
  shares: number | null,
  averageCost: number | null,
  currentPrice: number | null,
  reportedGain: number | null,
  calculatedGain: number | null,
  inferredCurrentPrice: boolean,
  inferredAverageCost: boolean,
  rowCurrentPrice: boolean,
): string[] {
  const warnings: string[] = []
  if (shares === null) warnings.push('找不到持有股數')
  if (averageCost === null) warnings.push('找不到平均成本')
  if (currentPrice === null) warnings.push('找不到目前價格')
  if (rowCurrentPrice) warnings.push('目前價格由持倉列辨識，加入時會自動更新')
  else if (inferredCurrentPrice) warnings.push('目前價格由市值或損益推算')
  if (inferredAverageCost) warnings.push('平均成本由總成本除以股數推算')
  if (reportedGain !== null && calculatedGain !== null && Math.abs(reportedGain - calculatedGain) > Math.max(5, Math.abs(reportedGain) * 0.08)) {
    warnings.push('截圖損益與辨識到的成本／價格不完全一致，請確認')
  }
  return warnings
}

function parseBlock(blockLines: string[], symbolToken: SymbolToken, sourceFileName: string, index: number): HoldingImportCandidate {
  const blockText = blockLines.join('\n')
  const market = inferMarket(symbolToken, blockText)
  const currency: Currency = market === 'TW' ? 'TWD' : 'USD'
  const rowValues = extractBrokerRowValues(blockLines)
  const shares = extractLabeledNumber(blockText, SHARE_LABEL, false) ?? rowValues.shares
  const explicitAverageCost = extractLabeledNumber(blockText, AVERAGE_COST_LABEL, false)
  const totalCost = extractLabeledNumber(blockText, TOTAL_COST_LABEL, false)
  const inferredAverageCost = explicitAverageCost === null && totalCost !== null && shares !== null && shares > 0
  const averageCost = explicitAverageCost ?? (inferredAverageCost ? totalCost / shares : null)
  const explicitCurrentPrice = extractLabeledNumber(blockText, CURRENT_PRICE_LABEL, false)
  const marketValue = extractLabeledNumber(blockText, MARKET_VALUE_LABEL, false) ?? rowValues.marketValue
  const reportedGain = extractLabeledNumber(blockText, GAIN_LABEL, false)
  const reportedGainPercent = extractLabeledNumber(blockText, GAIN_PERCENT_LABEL, true) ?? extractLabeledNumber(blockText, GAIN_LABEL, true)
  const inferredFromMarketValue = explicitCurrentPrice === null && marketValue !== null && shares !== null && shares > 0
  const inferredFromGain = explicitCurrentPrice === null && !inferredFromMarketValue && reportedGain !== null && shares !== null && shares > 0 && averageCost !== null
  const inferredFromGainPercent = explicitCurrentPrice === null && !inferredFromMarketValue && !inferredFromGain && reportedGainPercent !== null && averageCost !== null
  const inferredCurrentPrice = inferredFromMarketValue || inferredFromGain || inferredFromGainPercent
  const rowCurrentPrice = explicitCurrentPrice === null && rowValues.currentPrice !== null
  const currentPrice = explicitCurrentPrice
    ?? rowValues.currentPrice
    ?? (inferredFromMarketValue && marketValue !== null && shares !== null ? marketValue / shares : null)
    ?? (inferredFromGain && reportedGain !== null && shares !== null && averageCost !== null ? averageCost + reportedGain / shares : null)
    ?? (inferredFromGainPercent && reportedGainPercent !== null && averageCost !== null ? averageCost * (1 + reportedGainPercent / 100) : null)
  const calculatedGain = shares !== null && averageCost !== null && currentPrice !== null
    ? (currentPrice - averageCost) * shares
    : null
  const confidence = confidenceFor(shares, averageCost, currentPrice)
  const symbol = symbolToken.value.replace(/\.US$/i, '')
  return {
    id: `${sourceFileName}-${index + 1}`,
    sourceFileName,
    symbol,
    name: extractName(blockLines, symbolToken),
    market,
    currency,
    shares,
    averageCost: averageCost !== null && Number.isFinite(averageCost) ? Number(averageCost.toFixed(6)) : null,
    currentPrice: currentPrice !== null && Number.isFinite(currentPrice) ? Number(currentPrice.toFixed(6)) : null,
    reportedGain: reportedGain !== null ? Number(reportedGain.toFixed(6)) : null,
    reportedGainPercent: reportedGainPercent !== null ? Number(reportedGainPercent.toFixed(6)) : null,
    confidence,
    selected: shares !== null && shares > 0,
    warnings: createWarnings(shares, averageCost, currentPrice, reportedGain, calculatedGain, inferredCurrentPrice, inferredAverageCost, rowCurrentPrice),
    rawText: blockText,
  }
}

export function parseHoldingScreenshotText(text: string, sourceFileName = '持倉截圖'): HoldingImportCandidate[] {
  const lines = normalizeLines(text)
  const symbolLines = lines
    .map((line, index) => ({ line, index, token: findLikelySymbolToken(line) }))
    .filter((item): item is { line: string; index: number; token: SymbolToken } => item.token !== undefined)
  if (symbolLines.length === 0) return []

  return symbolLines.map((item, index) => {
    const nextLineIndex = symbolLines[index + 1]?.index ?? lines.length
    return parseBlock(lines.slice(item.index, nextLineIndex), item.token, sourceFileName, index)
  })
}

function findLikelySymbolToken(line: string): SymbolToken | undefined {
  const tokens = findSymbolTokens(line)
  return [...tokens].sort((left, right) => right.value.length - left.value.length || left.index - right.index)[0]
}

function scoreOcrText(text: string): number {
  const tokens = normalizeLines(text).flatMap((line) => findSymbolTokens(line))
  const numericLines = normalizeLines(text).filter((line) => extractNumbers(line).length > 0).length
  return tokens.length * 100 + tokens.reduce((total, token) => total + token.value.length, 0) + numericLines
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`無法讀取圖片「${file.name}」。`))
    }
    image.src = url
  })
}

async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const image = await loadImage(file)
  const maxDimension = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = Math.min(1.5, 2400 / maxDimension)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('目前瀏覽器無法建立圖片辨識畫布。')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < imageData.data.length; index += 4) {
    const gray = imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128))
    imageData.data[index] = contrasted
    imageData.data[index + 1] = contrasted
    imageData.data[index + 2] = contrasted
  }
  context.putImageData(imageData, 0, 0)
  return canvas
}

export async function recognizeHoldingImages(files: File[], onProgress?: (progress: OcrProgress) => void): Promise<OcrImageResult[]> {
  if (files.length === 0) return []
  const { createWorker, PSM } = await import('tesseract.js')
  let currentFileIndex = 0
  const worker = await createWorker(['eng', 'chi_tra'], 1, {
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    logger: (message) => {
      const currentFile = currentFileIndex + 1
      onProgress?.({
        currentFile,
        totalFiles: files.length,
        fileName: files[currentFile - 1]?.name ?? files[0].name,
        percent: Math.min(100, Math.round(((currentFile - 1 + (message.progress || 0)) / files.length) * 100)),
        status: message.status,
      })
    },
  })

  try {
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: PSM.SINGLE_BLOCK, user_defined_dpi: '300' })
    const results: OcrImageResult[] = []
    for (let index = 0; index < files.length; index += 1) {
      currentFileIndex = index
      const file = files[index]
      onProgress?.({ currentFile: index + 1, totalFiles: files.length, fileName: file.name, percent: Math.round((index / files.length) * 100), status: '辨識圖片' })
      const canvas = await preprocessImage(file)
      const blockResult = await worker.recognize(canvas)
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
      const sparseResult = await worker.recognize(canvas)
      const blockText = blockResult.data.text
      const sparseText = sparseResult.data.text
      const text = scoreOcrText(sparseText) > scoreOcrText(blockText) ? sparseText : blockText
      results.push({ fileName: file.name, text, confidence: Number.isFinite(blockResult.data.confidence) ? blockResult.data.confidence : null })
      onProgress?.({ currentFile: index + 1, totalFiles: files.length, fileName: file.name, percent: Math.round(((index + 1) / files.length) * 100), status: '完成' })
    }
    return results
  } finally {
    await worker.terminate()
  }
}
