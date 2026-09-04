import type { UrlStatus } from '../store/types'

/** Above this the link still works but chat tools and some browsers start to mangle it. */
export const URL_WARN_LENGTH = 8_000
/** Above this we stop writing the fragment; Safari and Edge truncate around here. */
export const URL_MAX_LENGTH = 32_000

export function readFragment(): string {
  return typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : ''
}

/** Base URL for share links: origin + path, no query, no fragment. */
export function baseUrl(): string {
  return location.origin + location.pathname
}

export function buildUrl(fragment: string): string {
  return `${baseUrl()}#${fragment}`
}

export function writeFragment(fragment: string) {
  if (readFragment() === fragment) return
  history.replaceState(history.state, '', fragment ? `#${fragment}` : baseUrl())
}

export function clearFragment() {
  if (location.hash) history.replaceState(history.state, '', baseUrl())
}

export function classifyUrlLength(url: string): Exclude<UrlStatus, 'unsupported'> {
  if (url.length > URL_MAX_LENGTH) return 'too-long'
  if (url.length > URL_WARN_LENGTH) return 'long'
  return 'ok'
}
