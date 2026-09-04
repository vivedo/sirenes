import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./scripts', () => ({
  loadScript: vi.fn(async () => {}),
  GIS_SRC: 'gis',
  GAPI_SRC: 'gapi',
}))
vi.mock('./config', () => ({
  DRIVE_SCOPE: 'scope',
  getDriveConfig: () => ({ clientId: 'cid', apiKey: 'k', appId: '1' }),
}))

type Cb = (r: google.accounts.oauth2.TokenResponse) => void

function installFakeGoogle(expiresIn = 3600) {
  let callback: Cb = () => {}
  const requestAccessToken = vi.fn(() =>
    setTimeout(
      () =>
        callback({
          access_token: `tok-${requestAccessToken.mock.calls.length}`,
          expires_in: expiresIn,
          scope: '',
          token_type: 'Bearer',
        }),
      0,
    ),
  )
  const revoke = vi.fn()
  ;(globalThis as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: Cb }) => {
          callback = cfg.callback
          return { requestAccessToken }
        },
        revoke,
      },
    },
  }
  return { requestAccessToken, revoke }
}

describe('drive auth', () => {
  beforeEach(() => vi.resetModules())

  it('prompts once and reuses the token until it expires', async () => {
    const fake = installFakeGoogle()
    const auth = await import('./auth')
    const seen: boolean[] = []
    auth.onAuthChange((v) => seen.push(v))
    expect(auth.isSignedIn()).toBe(false)
    const t1 = await auth.getAccessToken({ interactive: true })
    const t2 = await auth.getAccessToken({ interactive: false })
    expect(t1).toBe(t2)
    expect(fake.requestAccessToken).toHaveBeenCalledTimes(1)
    expect(auth.isSignedIn()).toBe(true)
    expect(seen).toEqual([true])
  })

  it('refuses to prompt when not interactive', async () => {
    installFakeGoogle()
    const auth = await import('./auth')
    await expect(auth.getAccessToken({ interactive: false })).rejects.toThrow(/Not signed in/)
  })

  it('signOut revokes and forgets; invalidateToken forces a new prompt', async () => {
    const fake = installFakeGoogle()
    const auth = await import('./auth')
    const t1 = await auth.getAccessToken({ interactive: true })
    auth.signOut()
    expect(fake.revoke).toHaveBeenCalledWith(t1)
    expect(auth.isSignedIn()).toBe(false)
    const t2 = await auth.getAccessToken({ interactive: true })
    expect(t2).not.toBe(t1)
    auth.invalidateToken()
    await auth.getAccessToken({ interactive: true })
    expect(fake.requestAccessToken).toHaveBeenCalledTimes(3)
  })
})
