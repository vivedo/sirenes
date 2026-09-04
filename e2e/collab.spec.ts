import { expect, test, type Page } from '@playwright/test'

/**
 * The e2e build uses the fake BroadcastChannel transport, so two pages in one context can talk.
 * Only the first page resets storage: deleting IndexedDB from a second page would block behind
 * the first page's open connection and stall its bootstrap.
 */
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (window.name === 'seeded') return
    window.name = 'seeded'
    localStorage.clear()
    sessionStorage.clear()
    indexedDB.deleteDatabase('keyval-store')
  })
}

/** Pages in one context share settings, so the panel may already be open. */
async function ensureAiPanel(page: Page) {
  if ((await page.getByTestId('ai-panel').count()) === 0)
    await page.getByTestId('toggle-ai').click()
  await expect(page.getByTestId('ai-panel')).toBeVisible()
}

async function typeAtEnd(page: Page, text: string) {
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

async function startHosting(page: Page) {
  await page.goto('/')
  await page.getByTestId('menu-share').click()
  await page.getByTestId('share-live').click()
  await page.getByTestId('live-name').fill('Ada')
  await page.getByTestId('live-start').click()
  await expect(page.getByTestId('live-status')).toContainText('Sharing')
  const link = (await page.getByTestId('live-link').textContent())!.trim()
  expect(link).toMatch(/#live:[a-z0-9]{24}$/)
  await page.keyboard.press('Escape')
  return link
}

test.beforeEach(async ({ page }) => seed(page))

test('host shares, guest joins, edits flow both ways with per-user undo', async ({
  page,
  context,
}) => {
  const link = await startHosting(page)
  expect(page.url()).toContain('#live:')

  const guest = await context.newPage()
  await guest.goto(link)
  await expect(guest.getByTestId('shared-badge')).toContainText('Shared by Ada')
  await expect(guest.locator('.cm-content').first()).toContainText('flowchart TD')
  await expect(guest.getByTestId('live-strip')).toContainText('2')
  await expect(page.getByTestId('live-strip')).toContainText('2')

  await typeAtEnd(guest, '\n    E --> G[From guest]')
  await expect(page.locator('.cm-content').first()).toContainText('From guest')
  await expect(page.locator('.preview-canvas svg')).toContainText('From guest')

  await typeAtEnd(page, '\n    G --> H[From host]')
  await expect(guest.locator('.cm-content').first()).toContainText('From host')

  // Guest undo reverts only the guest's own line.
  await guest.locator('.cm-content').first().click()
  await guest.keyboard.press('ControlOrMeta+Z')
  await expect(guest.locator('.cm-content').first()).not.toContainText('From guest')
  await expect(guest.locator('.cm-content').first()).toContainText('From host')
  await expect(page.locator('.cm-content').first()).toContainText('From host')

  // Theme travels too.
  await page.getByTestId('mermaid-theme').selectOption('tokyo-night')
  await expect(guest.getByTestId('mermaid-theme')).toHaveValue('tokyo-night')
})

test('guest sees a session title, no file identity, and can only save a copy', async ({
  page,
  context,
}) => {
  await page.goto('/')
  // Give the host's document a file identity that must never reach the guest.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    w.showSaveFilePicker = async () => ({
      kind: 'file',
      name: 'secret-plan.mmd',
      queryPermission: async () => 'granted',
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    })
  })
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.getByTestId('toolbar-title')).toContainText('secret-plan.mmd')

  await page.getByTestId('menu-share').click()
  await page.getByTestId('share-live').click()
  await page.getByTestId('live-start').click()
  await page.getByTestId('live-title').fill('Q4 architecture')
  const link = (await page.getByTestId('live-link').textContent())!.trim()
  await page.keyboard.press('Escape')

  const guest = await context.newPage()
  // No File System Access API on the guest, so "Save a copy" goes through the in-app panel.
  await guest.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    delete w.showOpenFilePicker
    delete w.showSaveFilePicker
  })
  await guest.goto(link)
  await expect(guest.getByTestId('toolbar-title')).toContainText('Q4 architecture')
  await expect(guest.getByTestId('toolbar-title')).not.toContainText('secret-plan')
  await expect(guest.locator('body')).not.toContainText('secret-plan')

  await guest.getByTestId('menu-file').click()
  await expect(guest.getByTestId('file-save-copy')).toBeVisible()
  await expect(guest.getByTestId('file-save')).toHaveCount(0)
  await expect(guest.getByTestId('file-open')).toHaveCount(0)
  await expect(guest.getByTestId('drive-open')).toHaveCount(0)
  await guest.keyboard.press('Escape')

  // Save a copy (download fallback in this test) does not change the guest's title.
  const download = guest.waitForEvent('download')
  await guest.getByTestId('menu-file').click()
  await guest.getByTestId('file-save-copy').click()
  await guest.getByTestId('save-name').fill('my-copy.mmd')
  await guest.getByTestId('save-submit').click()
  expect((await download).suggestedFilename()).toBe('my-copy.mmd')
  await expect(guest.getByTestId('toolbar-title')).toContainText('Q4 architecture')
})

test('read-only toggle and ending the session', async ({ page, context }) => {
  const link = await startHosting(page)
  const guest = await context.newPage()
  await guest.goto(link)
  await expect(guest.getByTestId('shared-badge')).toBeVisible()
  await expect(guest.locator('.cm-content').first()).toContainText('flowchart TD')

  await page.getByTestId('live-strip').click()
  await page.getByTestId('live-can-edit').uncheck()
  await expect
    .poll(() => guest.locator('.cm-content').first().getAttribute('contenteditable'))
    .toBe('false')
  await page.getByTestId('live-can-edit').check()
  await expect
    .poll(() => guest.locator('.cm-content').first().getAttribute('contenteditable'))
    .toBe('true')

  await page.getByTestId('live-leave').click()
  await expect(page.getByTestId('live-strip')).toHaveCount(0)
  await expect(guest.locator('.toast')).toContainText('host ended the session')
  await expect(guest.getByTestId('live-strip')).toHaveCount(0)
  await expect(guest.getByTestId('shared-badge')).toHaveCount(0)
  // Guest keeps an editable local copy and its own static share link again.
  await expect(guest.locator('.cm-content').first()).toContainText('flowchart TD')
  await typeAtEnd(guest, '\n    X --> Y')
  await expect(guest.locator('.cm-content').first()).toContainText('X --> Y')
  await expect.poll(() => guest.evaluate(() => location.hash)).toMatch(/^#pako:/)
  // The host's address bar also returns to the static link.
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#pako:/)
})

test('joining a dead session explains and offers retry', async ({ page }) => {
  await page.goto('/#live:nobodyhome0000000000000')
  await expect(page.getByTestId('join-banner')).toContainText('Could not join')
  await expect(page.getByTestId('join-retry')).toBeVisible()
})

const REPLY =
  'Added a retry loop.\n```mermaid\nflowchart TD\n    A[Start] --> B{Is it working?}\n    B -- Yes --> C[Ship it]\n    B -- No --> D[Debug]\n    D --> R[Retry]\n    R --> B\n    C --> E([Done])\n```'

async function mockOpenRouter(page: Page) {
  await page.route('https://openrouter.ai/api/v1/auth/key', (route) =>
    route.fulfill({ json: { data: { label: 'host key', usage: 0, limit: 10 } } }),
  )
  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'test/fast',
            name: 'Test Fast',
            context_length: 32000,
            pricing: { prompt: '0', completion: '0' },
          },
        ],
      },
    }),
  )
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    const frames = [
      ...REPLY.match(/[\s\S]{1,25}/g)!.map((piece) =>
        JSON.stringify({ choices: [{ delta: { content: piece } }] }),
      ),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 40, cost: 0.0001 },
      }),
      '[DONE]',
    ]
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: frames.map((f) => `data: ${f}\n\n`).join(''),
    })
  })
}

test("guests use the host's assistant as one shared chat, and the host can turn it off", async ({
  page,
  context,
}) => {
  await mockOpenRouter(page)
  const link = await startHosting(page)
  // Host sets up a key.
  await ensureAiPanel(page)
  await page.getByTestId('ai-key-input').fill('sk-or-v1-host-000000000')
  await page.getByTestId('ai-save-key').click()
  await expect(page.getByTestId('ai-host-note')).toContainText('Shared with your guests')

  const guest = await context.newPage()
  // Pages in one context share localStorage, so the guest sees the host's key too; what matters
  // is that the guest never runs a completion itself.
  let guestCompletionCalls = 0
  await guest.route('https://openrouter.ai/**', (route) => {
    if (route.request().url().includes('/chat/completions')) guestCompletionCalls++
    return route.fulfill({ status: 500 })
  })
  await guest.goto(link)
  await expect(guest.getByTestId('shared-badge')).toBeVisible()
  await ensureAiPanel(guest)
  await expect(guest.getByTestId('ai-shared-note')).toContainText("Runs on Ada's key")
  // The guest never needs a key of its own.
  await expect(guest.getByTestId('ai-key-settings')).toHaveCount(0)

  await guest.getByTestId('live-strip').click()
  await guest.getByTestId('live-name').fill('Grace')
  await guest.keyboard.press('Escape')

  await guest.getByTestId('ai-input').fill('add a retry loop after debug')
  await guest.getByTestId('ai-send').click()
  // The host executes it and both sides see the same conversation with the author's name.
  await expect(page.getByTestId('ai-msg-author')).toContainText('Grace')
  await expect(page.getByTestId('ai-proposal')).toBeVisible()
  await expect(guest.getByTestId('ai-msg-author')).toContainText('Grace')
  await expect(guest.getByTestId('ai-proposal')).toBeVisible()
  await expect(guest.getByTestId('ai-msg-assistant')).toContainText('Added a retry loop.')
  expect(guestCompletionCalls).toBe(0)

  // Guest accepts: the host applies it and the shared diagram updates everywhere.
  await guest.getByTestId('ai-accept').click()
  await expect(page.locator('.cm-content').first()).toContainText('R[Retry]')
  await expect(guest.locator('.cm-content').first()).toContainText('R[Retry]')
  await expect(page.getByTestId('ai-proposal')).toContainText('Applied by Grace')
  await expect(guest.getByTestId('ai-proposal')).toContainText('Applied by Grace')

  // Host turns the shared assistant off; the guest composer is disabled with a reason.
  await page.getByTestId('live-strip').click()
  await page.getByTestId('live-ai-enabled').uncheck()
  await expect(guest.getByTestId('ai-input')).toBeDisabled()
  await expect(guest.getByTestId('ai-panel')).toContainText('turned the shared assistant off')
  await page.getByTestId('live-ai-enabled').check()
  await expect(guest.getByTestId('ai-input')).toBeEnabled()

  // The strip toggles the panel closed and open.
  await expect(page.getByTestId('live-panel')).toBeVisible()
  await page.getByTestId('live-strip').click()
  await expect(page.getByTestId('live-panel')).toHaveCount(0)
  await page.getByTestId('live-strip').click()
  await expect(page.getByTestId('live-panel')).toBeVisible()
})
