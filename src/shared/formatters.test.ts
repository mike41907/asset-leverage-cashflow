import { describe, expect, it } from 'vitest'
import { formatYieldPercent } from './formatters'

describe('formatYieldPercent', () => {
  it('rounds yield values to at most two decimal places', () => {
    expect(formatYieldPercent(7.777)).toBe('7.78%')
    expect(formatYieldPercent(8)).toBe('8%')
  })

  it('keeps missing yield values readable', () => {
    expect(formatYieldPercent(null)).toBe('—')
  })
})
