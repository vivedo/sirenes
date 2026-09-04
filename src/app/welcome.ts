export const WELCOMED_KEY = 'sirenes:welcomed'

export function hasBeenWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === '1'
  } catch {
    return true // storage blocked: do not nag on every load
  }
}

export function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, '1')
  } catch {
    /* ignore */
  }
}
