import { describe, expect, it } from 'vitest'
import { clearApiKey, maskKey, readApiKey, writeApiKey, KEY_STORAGE_KEY } from './keyStorage'

describe('keyStorage', () => {
  it('writes to localStorage in local mode and clears the other store', () => {
    writeApiKey('sk-or-v1-abcdefghijklmnop', 'session')
    expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeTruthy()
    writeApiKey('sk-or-v1-abcdefghijklmnop', 'local')
    expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeNull()
    expect(readApiKey()).toEqual({ key: 'sk-or-v1-abcdefghijklmnop', mode: 'local' })
    clearApiKey()
    expect(readApiKey()).toBeNull()
  })

  it('masks all but the ends', () => {
    expect(maskKey('sk-or-v1-abcdefghijklmnop')).toBe('sk-or-…mnop')
    expect(maskKey('short')).toBe('•••••')
  })
})
