import { describe, expect, it } from 'vitest'
import { formatMermaid } from './format'

describe('formatMermaid', () => {
  it('trims trailing whitespace, collapses blank runs, normalises endings', () => {
    const input = 'graph TD  \r\n\r\n\r\n\r\n  A --> B\t\n\n\n'
    expect(formatMermaid(input)).toBe('graph TD\n\n  A --> B\n')
  })
  it('returns empty string for empty input', () => {
    expect(formatMermaid('')).toBe('')
    expect(formatMermaid('\n\n')).toBe('')
  })
  it('is idempotent', () => {
    const once = formatMermaid('a\n\n\nb  \n')
    expect(formatMermaid(once)).toBe(once)
  })
})
