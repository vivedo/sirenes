import { expect, test, devices, type Page } from '@playwright/test'

/** Phone-sized viewport with touch. The desktop suite runs elsewhere at 1280px. */
test.use({ ...devices['Pixel 7'], hasTouch: true })

async function seed(page: Page) {
  await page.addInitScript(() => {
    if (window.name === 'seeded') return
    window.name = 'seeded'
    localStorage.clear()
    localStorage.setItem('sirenes:welcomed', '1')
    indexedDB.deleteDatabase('keyval-store')
  })
}

test.beforeEach(async ({ page }) => seed(page))

test('phone layout: compact toolbar, one pane at a time, bottom navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('mobile-toolbar')).toBeVisible()
  await expect(page.getByTestId('mobile-nav')).toBeVisible()
  await expect(page.locator('.statusbar')).toHaveCount(0)
  // Nothing wraps: the toolbar stays a single row.
  const bar = (await page.getByTestId('mobile-toolbar').boundingBox())!
  expect(bar.height).toBeLessThan(56)

  // Code first, preview on request; the editor stays mounted (undo history and bindings survive).
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.getByTestId('preview')).toBeHidden()
  await page.getByTestId('mobile-pane-preview').click()
  await expect(page.locator('.preview-canvas svg')).toBeVisible()
  await expect(page.locator('.cm-content')).toBeHidden()
  const svg = (await page.locator('.preview-canvas svg').boundingBox())!
  const viewport = page.viewportSize()!
  expect(svg.width).toBeLessThanOrEqual(viewport.width)
  await page.getByTestId('mobile-pane-editor').click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('flowchart TD')
})

test('phone: menus fit the screen, theme and interface toggles work from the More menu', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('mobile-more').click()
  const menu = page.locator('.menu-list').last()
  await expect(menu).toBeVisible()
  const box = (await menu.boundingBox())!
  const vw = page.viewportSize()!.width
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vw + 1)
  await page.getByTestId('mobile-theme').selectOption('tokyo-night')
  await page.getByTestId('toggle-ui-theme').click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await page.getByTestId('mobile-pane-preview').click()
  await expect
    .poll(() => page.locator('.preview-canvas svg').getAttribute('style'))
    .toMatch(/--bg:\s*#1a1b26/i)
})

test('phone: the AI panel opens as a full-screen sheet and closes back to the editor', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('toggle-ai').click()
  const panel = page.getByTestId('ai-panel')
  await expect(panel).toBeVisible()
  const box = (await panel.boundingBox())!
  const vp = page.viewportSize()!
  expect(Math.round(box.width)).toBe(vp.width)
  expect(box.height).toBeGreaterThan(vp.height * 0.9)
  await expect(page.getByTestId('ai-panel-resizer')).toBeHidden()
  await panel.getByRole('button', { name: 'Close AI panel' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('phone: pinch zooms the preview', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('mobile-pane-preview').click()
  await expect(page.locator('.preview-canvas svg')).toBeVisible()
  const before = Number(await page.locator('.preview-canvas svg').getAttribute('width'))
  const vp = page.locator('.preview-viewport')
  const b = (await vp.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  // Two synthetic touch pointers moving apart.
  await vp.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    button: 0,
    clientX: cx - 40,
    clientY: cy,
    isPrimary: true,
  })
  await vp.dispatchEvent('pointerdown', {
    pointerId: 2,
    pointerType: 'touch',
    button: 0,
    clientX: cx + 40,
    clientY: cy,
    isPrimary: false,
  })
  await vp.dispatchEvent('pointermove', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: cx - 100,
    clientY: cy,
  })
  await vp.dispatchEvent('pointermove', {
    pointerId: 2,
    pointerType: 'touch',
    clientX: cx + 100,
    clientY: cy,
  })
  await vp.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' })
  await vp.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' })
  await expect
    .poll(() => page.locator('.preview-canvas svg').getAttribute('width').then(Number))
    .toBeGreaterThan(before * 1.8)
})

test('phone: diagram tabs, share link and files still work', async ({ page, context }) => {
  await page.goto('/')
  await page.getByTestId('diagram-tab-add').click()
  await page.getByTestId('diagram-tab-input').fill('Second')
  await page.getByTestId('diagram-tab-input').press('Enter')
  await expect(page.getByTestId('diagram-tab-1')).toContainText('Second')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByTestId('menu-share').click()
  await page.getByTestId('copy-share-link').click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(url).toContain('#pako:')
  await page.getByTestId('menu-file').click()
  await expect(page.getByTestId('file-save-as')).toBeVisible()
})

test('phone: a live-session guest keeps a single-row toolbar and menus stay on screen', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByTestId('menu-share').click()
  await page.getByTestId('share-live').click()
  await page.getByTestId('live-name').fill('vivedo')
  await page.getByTestId('live-start').click()
  await expect(page.getByTestId('live-status')).toContainText('Sharing')
  await page.getByTestId('live-title').fill('things random')
  const link = (await page.getByTestId('live-link').textContent())!.trim()
  await page.keyboard.press('Escape')

  const guest = await context.newPage()
  await guest.goto(link)
  await expect(guest.getByTestId('shared-badge')).toBeVisible()
  const bar = (await guest.getByTestId('mobile-toolbar').boundingBox())!
  expect(bar.height).toBeLessThan(56)
  const vw = guest.viewportSize()!.width
  for (const id of ['mobile-more', 'menu-share']) {
    await guest.getByTestId(id).click()
    const menu = guest.locator('.menu-list').last()
    await expect(menu).toBeVisible()
    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 1)
    await guest.keyboard.press('Escape')
  }
})
