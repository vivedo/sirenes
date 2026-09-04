import type { UiTheme } from '../store/types'

const media = () =>
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

export function resolveUiTheme(theme: UiTheme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return media()?.matches ? 'dark' : 'light'
}

export function applyUiTheme(theme: UiTheme) {
  document.documentElement.dataset.theme = resolveUiTheme(theme)
}

/** Keeps the document's data-theme in sync with the setting and the OS preference. */
export function watchUiTheme(getTheme: () => UiTheme): () => void {
  const mq = media()
  const handler = () => applyUiTheme(getTheme())
  mq?.addEventListener('change', handler)
  handler()
  return () => mq?.removeEventListener('change', handler)
}
