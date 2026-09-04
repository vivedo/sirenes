import { describe, expect, it } from 'vitest'
import { URL_MAX_LENGTH, URL_WARN_LENGTH, classifyUrlLength } from './urlState'

describe('classifyUrlLength', () => {
  it('classifies by thresholds', () => {
    expect(classifyUrlLength('x'.repeat(100))).toBe('ok')
    expect(classifyUrlLength('x'.repeat(URL_WARN_LENGTH))).toBe('ok')
    expect(classifyUrlLength('x'.repeat(URL_WARN_LENGTH + 1))).toBe('long')
    expect(classifyUrlLength('x'.repeat(URL_MAX_LENGTH))).toBe('long')
    expect(classifyUrlLength('x'.repeat(URL_MAX_LENGTH + 1))).toBe('too-long')
  })
})
