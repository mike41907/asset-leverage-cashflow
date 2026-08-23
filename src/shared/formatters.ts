import type { NumberDisplayMode } from '../domain/models'

const exactFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 0,
})

const decimalFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 2,
})

export function formatTwd(value: number, mode: NumberDisplayMode = 'exact'): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value < 0 ? '-' : ''
  const absolute = Math.abs(value)

  if (mode === 'compact') {
    if (absolute >= 100_000_000) return `${sign}NT$${decimalFormatter.format(absolute / 100_000_000)}億`
    if (absolute >= 10_000) return `${sign}NT$${decimalFormatter.format(absolute / 10_000)}萬`
  }

  return `${sign}NT$${exactFormatter.format(absolute)}`
}

export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: fractionDigits }).format(value)
}

export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null) return '—'
  if (value === Number.POSITIVE_INFINITY) return '∞'
  if (!Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: fractionDigits }).format(value)}%`
}

export function formatYieldPercent(value: number | null): string {
  return formatPercent(value, 2)
}

export function formatRatio(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return '∞'
  if (!Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(value)}x`
}

export function formatCurrencyWithSign(value: number, mode: NumberDisplayMode = 'exact'): string {
  if (!Number.isFinite(value)) return '—'
  return value >= 0 ? `+${formatTwd(value, mode)}` : formatTwd(value, mode)
}
