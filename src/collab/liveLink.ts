import { baseUrl } from '../share/urlState'

export const LIVE_PREFIX = 'live:'

export function liveLink(sessionId: string) {
  return `${baseUrl()}#${LIVE_PREFIX}${sessionId}`
}
