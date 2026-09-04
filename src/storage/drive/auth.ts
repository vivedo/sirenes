import { DRIVE_SCOPE, getDriveConfig } from './config'
import { GIS_SRC, loadScript } from './scripts'

/**
 * Access token lives in memory only. It is short-lived (about an hour) and Google Identity
 * Services can mint a new one silently for a signed-in user, so persisting it buys nothing.
 */
interface TokenState {
  token: string
  expiresAt: number
}

let state: TokenState | null = null
let client: google.accounts.oauth2.TokenClient | null = null
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
const listeners = new Set<(signedIn: boolean) => void>()

function notify() {
  const signedIn = isSignedIn()
  for (const l of listeners) l(signedIn)
}

export function onAuthChange(listener: (signedIn: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isSignedIn(): boolean {
  return state !== null && state.expiresAt > Date.now()
}

async function ensureClient(): Promise<google.accounts.oauth2.TokenClient> {
  if (client) return client
  const config = getDriveConfig()
  if (!config) throw new Error('Google Drive is not configured for this deployment.')
  await loadScript(GIS_SRC)
  client = google.accounts.oauth2.initTokenClient({
    client_id: config.clientId,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      const p = pending
      pending = null
      if (response.error || !response.access_token) {
        p?.reject(new Error(response.error_description ?? response.error ?? 'Sign-in failed'))
        return
      }
      state = {
        token: response.access_token,
        expiresAt: Date.now() + (response.expires_in - 60) * 1000,
      }
      notify()
      p?.resolve(response.access_token)
    },
    error_callback: (err) => {
      const p = pending
      pending = null
      p?.reject(
        new Error(
          err.type === 'popup_closed' ? 'Sign-in was cancelled.' : (err.message ?? err.type),
        ),
      )
    },
  })
  return client
}

export interface TokenOptions {
  /** Allow a popup. Must be called from a user gesture when true. */
  interactive: boolean
  /** Force the consent screen (used after a 401 to make Google re-issue). */
  forceConsent?: boolean
}

/** Get a valid access token, refreshing or prompting as allowed. */
export async function getAccessToken(opts: TokenOptions): Promise<string> {
  if (state && state.expiresAt > Date.now() && !opts.forceConsent) return state.token
  if (!opts.interactive) throw new Error('Not signed in to Google.')
  const c = await ensureClient()
  if (pending) throw new Error('A sign-in is already in progress.')
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    // An empty prompt lets Google skip the account chooser when the user has one session.
    c.requestAccessToken({ prompt: opts.forceConsent ? 'consent' : state ? '' : undefined })
  })
}

export function signOut() {
  const token = state?.token
  state = null
  notify()
  if (token && typeof google !== 'undefined' && google.accounts?.oauth2) {
    try {
      google.accounts.oauth2.revoke(token)
    } catch {
      /* best effort */
    }
  }
}

/** Drop a token the API rejected so the next call re-prompts. */
export function invalidateToken() {
  state = null
  notify()
}
