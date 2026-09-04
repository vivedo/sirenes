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
