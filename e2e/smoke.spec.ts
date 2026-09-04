import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    indexedDB.deleteDatabase('keyval-store')
  })
})

test('renders the default template and updates the URL', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.preview-canvas svg')).toBeVisible()
  await expect(page.getByTestId('status-render')).toContainText('No errors')
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#pako:/)
})

test('typing re-renders and reports syntax errors inline', async ({ page }) => {
  await page.goto('/')
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('sequenceDiagram\nAlice->>Bob: Hello')
  await expect(page.locator('.preview-canvas svg')).toBeVisible()
  await expect(page.locator('.preview-canvas svg')).toContainText('Alice')

  await page.keyboard.type('\nthis is not valid')
  await expect(page.getByTestId('status-render')).toContainText('Line')
  await expect(page.locator('.cm-error-line')).toBeVisible()
  // The last good diagram is still on screen.
  await expect(page.locator('.preview-canvas svg')).toContainText('Alice')
})

test('share link round-trips the diagram and theme', async ({ page, context }) => {
  await page.goto('/')
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('pie\n"Shared": 70\n"Local": 30')
  await page.getByTestId('mermaid-theme').selectOption('forest')
  await expect.poll(() => page.evaluate(() => location.hash.length)).toBeGreaterThan(20)
  const url = page.url()

  const other = await context.newPage()
  await other.goto(url)
  await expect(other.locator('.cm-content')).toContainText('"Shared": 70')
  await expect(other.getByTestId('mermaid-theme')).toHaveValue('forest')
  await expect(other.locator('.preview-canvas svg')).toContainText('Shared')
})

test('opens a mermaid.live-style link', async ({ page }) => {
  // Compressed with zlib deflate, mermaid.live wire shape.
  const payload = JSON.stringify({
    code: 'graph LR\n  live --> sirenes',
    mermaid: '{"theme":"dark"}',
  })
  await page.goto('/')
  const fragment = await page.evaluate(async (json) => {
    const bytes = new TextEncoder().encode(json)
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
    const out = new Uint8Array(await new Response(stream).arrayBuffer())
    return (
      'pako:' +
      btoa(String.fromCharCode(...out))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    )
  }, payload)
  await page.goto('/#' + fragment)
  await expect(page.locator('.cm-content')).toContainText('live --> sirenes')
  await expect(page.getByTestId('mermaid-theme')).toHaveValue('dark')
})

test('view-only link opens in preview mode', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-share').click()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByTestId('copy-view-link').click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(url).toContain('#pako:')
  await page.goto(url)
  await expect(page.getByTestId('layout-preview')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.cm-content')).toBeHidden()
})

test('layout toggles and theme switch work', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('layout-editor').click()
  await expect(page.getByTestId('preview')).toBeHidden()
  await page.getByTestId('layout-split').click()
  await expect(page.getByTestId('preview')).toBeVisible()
  await page.getByTestId('toggle-ui-theme').click()
  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(['light', 'dark']).toContain(theme)
})

test('templates load and render without errors', async ({ page }) => {
  await page.goto('/')
  page.on('dialog', (d) => d.accept())
  for (const id of [
    'sequence',
    'class',
    'state',
    'er',
    'gantt',
    'pie',
    'mindmap',
    'timeline',
    'gitgraph',
  ]) {
    await page.getByTestId('menu-new').click()
    await page.getByTestId(`template-${id}`).click()
    await expect(page.getByTestId('status-render')).toContainText('No errors', { timeout: 10_000 })
    await expect(page.locator('.preview-canvas svg')).toBeVisible()
  }
})
