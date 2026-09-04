import { expect, test, type Page } from '@playwright/test'

/** Stub Google Identity Services, the Picker, and the Drive REST API. */
async function stubGoogle(page: Page) {
  const state = {
    content: 'graph TD\n  drive --> file\n',
    modifiedTime: '2026-09-04T10:00:00.000Z',
    patches: [] as string[],
    creates: [] as { name: string; body: string }[],
  }
  // The GIS and gapi scripts must not hit the network.
  await page.route('https://accounts.google.com/gsi/client', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '// stub' }),
  )
  await page.route('https://apis.google.com/js/api.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '// stub' }),
  )
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    const chain = () => {
      const o: Record<string, unknown> = {}
      const self = new Proxy(o, {
        get: (_t, prop) => (prop === 'build' ? () => picker : () => self),
      })
      return self
    }
    let cb: ((d: unknown) => void) | null = null
    const picker = {
      setVisible: () => cb?.({ action: 'picked', docs: [{ id: 'file-1', name: 'drive.mmd' }] }),
      dispose: () => {},
    }
    w.google = {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () =>
              setTimeout(
                () =>
                  cfg.callback({
                    access_token: 'e2e-token',
                    expires_in: 3600,
                    scope: '',
                    token_type: 'Bearer',
                  }),
                0,
              ),
          }),
          revoke: () => {},
        },
      },
      picker: {
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
        ViewId: { DOCS: 'docs' },
        DocsViewMode: { LIST: 'list' },
        DocsView: class {
          setMimeTypes() {
            return this
          }
          setIncludeFolders() {
            return this
          }
          setMode() {
            return this
          }
        },
        PickerBuilder: class {
          addView() {
            return this
          }
          setOAuthToken() {
            return this
          }
          setDeveloperKey() {
            return this
          }
          setAppId() {
            return this
          }
          setTitle() {
            return this
          }
          setOrigin() {
            return this
          }
          enableFeature() {
            return this
          }
          setCallback(fn: (d: unknown) => void) {
            cb = fn
            return this
          }
          build() {
            return picker
          }
        },
      },
    }
    void chain
    w.gapi = { load: (_: string, done: () => void) => done() }
  })
  await page.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request()
    const url = req.url()
    const auth = req.headers()['authorization']
    if (auth !== 'Bearer e2e-token')
      return route.fulfill({ status: 401, json: { error: { message: 'bad token' } } })
    if (req.method() === 'GET' && url.includes('alt=media'))
      return route.fulfill({ body: state.content, contentType: 'text/plain' })
    if (req.method() === 'GET')
      return route.fulfill({
        json: {
          id: 'file-1',
          name: 'drive.mmd',
          mimeType: 'text/plain',
          modifiedTime: state.modifiedTime,
        },
      })
    if (req.method() === 'PATCH') {
      state.content = req.postData() ?? ''
      state.patches.push(state.content)
      state.modifiedTime = '2026-09-04T11:00:00.000Z'
      return route.fulfill({
        json: {
          id: 'file-1',
          name: 'drive.mmd',
          mimeType: 'text/plain',
          modifiedTime: state.modifiedTime,
        },
      })
    }
    if (req.method() === 'POST') {
      const body = req.postData() ?? ''
      const name = /"name":"([^"]+)"/.exec(body)?.[1] ?? 'unknown'
      state.creates.push({ name, body })
      return route.fulfill({
        json: {
          id: 'file-2',
          name,
          mimeType: 'text/plain',
          modifiedTime: '2026-09-04T12:00:00.000Z',
        },
      })
    }
    return route.fulfill({ status: 500 })
  })
  return state
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.name === 'seeded') return
    window.name = 'seeded'
    localStorage.clear()
    indexedDB.deleteDatabase('keyval-store')
  })
})

test('open from Drive, save in place, detect a remote change, save as copy', async ({ page }) => {
  const drive = await stubGoogle(page)
  await page.goto('/')
  await page.getByTestId('menu-file').click()
  await expect(page.getByTestId('drive-open')).toBeEnabled()
  await page.getByTestId('drive-open').click()
  await expect(page.getByTestId('toolbar-title')).toContainText('drive.mmd')
  await expect(page.locator('.cm-content').first()).toContainText('drive --> file')

  await page.locator('.cm-content').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('\n  file --> saved')
  await page.keyboard.press('ControlOrMeta+S')
  await expect(page.getByTestId('toolbar-title')).not.toContainText('•')
  expect(drive.patches).toHaveLength(1)
  expect(drive.patches[0]).toContain('file --> saved')

  // Someone else edits the file on Drive.
  drive.modifiedTime = '2026-09-04T11:30:00.000Z'
  await page.keyboard.type('\n  saved --> again')
  await page.keyboard.press('ControlOrMeta+S')
  await expect(page.getByTestId('choice-dialog')).toBeVisible()
  await expect(page.getByTestId('choice-dialog')).toContainText('changed on Google Drive')
  page.once('dialog', (d) => d.accept('copy.mmd'))
  await page.getByTestId('choice-copy').click()
  await expect(page.getByTestId('toolbar-title')).toContainText('copy.mmd')
  expect(drive.creates).toHaveLength(1)
  expect(drive.creates[0].name).toBe('copy.mmd')
  expect(drive.creates[0].body).toContain('saved --> again')
  expect(drive.patches).toHaveLength(1)

  // Recent lists the Drive files; sign out entry appears.
  await page.getByTestId('menu-file').click()
  await expect(page.getByTestId('file-recent').first()).toContainText('copy.mmd')
  await expect(page.getByTestId('drive-sign-out')).toBeVisible()
})

test('Drive "Open with" deep link shows a banner that opens the file', async ({ page }) => {
  await stubGoogle(page)
  const state = encodeURIComponent(JSON.stringify({ ids: ['file-1'], action: 'open', userId: '1' }))
  await page.goto(`/?state=${state}`)
  await expect(page.getByTestId('drive-banner')).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await page.getByTestId('drive-banner-open').click()
  await expect(page.getByTestId('toolbar-title')).toContainText('drive.mmd')
  await expect(page.getByTestId('drive-banner')).toHaveCount(0)
})
