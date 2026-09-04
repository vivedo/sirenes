/**
 * The OpenRouter key lives in localStorage by default (remembered on this device) or in
 * sessionStorage (forgotten when the tab closes). Never anywhere else.
 */
export const KEY_STORAGE_KEY = 'sirenes:openrouter-key'
export type KeyStorageMode = 'local' | 'session'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function readApiKey(): { key: string; mode: KeyStorageMode } | null {
  const local = safe(() => localStorage.getItem(KEY_STORAGE_KEY), null)
  if (local) return { key: local, mode: 'local' }
  const session = safe(() => sessionStorage.getItem(KEY_STORAGE_KEY), null)
  if (session) return { key: session, mode: 'session' }
  return null
}

export function writeApiKey(key: string, mode: KeyStorageMode) {
  clearApiKey()
  safe(
    () => (mode === 'local' ? localStorage : sessionStorage).setItem(KEY_STORAGE_KEY, key),
    undefined,
  )
}

export function clearApiKey() {
  safe(() => localStorage.removeItem(KEY_STORAGE_KEY), undefined)
  safe(() => sessionStorage.removeItem(KEY_STORAGE_KEY), undefined)
}

export function maskKey(key: string): string {
  if (key.length <= 10) return '•'.repeat(key.length)
  return `${key.slice(0, 6)}…${key.slice(-4)}`
}
