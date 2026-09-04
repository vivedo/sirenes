import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.name === 'seeded') return
    window.name = 'seeded'
    localStorage.clear()
    indexedDB.deleteDatabase('keyval-store')
  })
})

test('default theme renders the flowchart with the beautiful engine', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('mermaid-theme')).toHaveValue('zinc-light')
  await expect(page.getByTestId('status-engine')).toContainText('beautiful-mermaid')
  const style = await page.locator('.preview-canvas svg').getAttribute('style')
  expect(style).toMatch(/--bg:\s*#ffffff/i)
})

test('switching to a dark beautiful theme changes the SVG colours and survives a share link', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByTestId('mermaid-theme').selectOption('tokyo-night')
  await expect
    .poll(() => page.locator('.preview-canvas svg').getAttribute('style'))
    .toMatch(/--bg:\s*#1a1b26/i)
  await expect.poll(() => page.evaluate(() => location.hash.length)).toBeGreaterThan(20)
  const other = await context.newPage()
  await other.goto(page.url())
  await expect(other.getByTestId('mermaid-theme')).toHaveValue('tokyo-night')
})

test('unsupported diagram types fall back to Mermaid with a notice', async ({ page }) => {
  await page.goto('/')
  page.on('dialog', (d) => d.accept())
  await page.getByTestId('menu-new').click()
  await page.getByTestId('template-pie').click()
  await expect(page.getByTestId('status-render')).toContainText('No errors')
  await expect(page.getByTestId('preview-fallback')).toBeVisible()
  await expect(page.getByTestId('status-engine')).toContainText('Mermaid 11')
  await expect(page.locator('.preview-canvas svg')).toBeVisible()

  // Classic Mermaid themes never show the fallback notice.
  await page.getByTestId('mermaid-theme').selectOption('forest')
  await expect(page.getByTestId('preview-fallback')).toHaveCount(0)
})

test('ASCII preview mode renders text, toggles plain characters, and reports unsupported types', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('preview-mode-ascii').click()
  await expect(page.getByTestId('preview-ascii')).toContainText('Start')
  await expect(page.getByTestId('preview-ascii')).toContainText('┌')
  await page.getByTestId('ascii-plain').check()
  await expect(page.getByTestId('preview-ascii')).not.toContainText('┌')
  await expect(page.getByTestId('preview-ascii')).toContainText('+')

  page.on('dialog', (d) => d.accept())
  await page.getByTestId('menu-new').click()
  await page.getByTestId('template-gantt').click()
  await expect(page.getByTestId('preview')).toContainText('ASCII rendering supports')

  await page.getByTestId('preview-mode-svg').click()
  await expect(page.locator('.preview-canvas svg')).toBeVisible()
})
