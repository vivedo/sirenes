import { describe, expect, it } from 'vitest'
import { fromBase64Url, toBase64Url } from './base64url'

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(1024).map((_, i) => (i * 7919) % 256)
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
  })

  it('produces no padding and only URL-safe characters', () => {
    for (const len of [1, 2, 3, 4, 5]) {
      const s = toBase64Url(new Uint8Array(len).fill(0xfb))
      expect(s).not.toMatch(/[+/=]/)
    }
  })

  it('accepts standard alphabet with padding', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe])
    const standard = btoa(String.fromCharCode(...bytes)) // "+//+"
    expect(fromBase64Url(standard)).toEqual(bytes)
    expect(fromBase64Url(standard.replace(/=+$/, ''))).toEqual(bytes)
  })

  it('rejects impossible lengths', () => {
    expect(() => fromBase64Url('a')).toThrow()
  })
})
