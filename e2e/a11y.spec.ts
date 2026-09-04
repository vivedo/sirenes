import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

async function audit(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // Mermaid's generated SVG and CodeMirror's contenteditable are third-party output.
    .exclude('.preview-canvas')
    .exclude('.cm-editor')
    .analyze()
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
}

test('welcome dialog and main screen have no serious accessibility violations', async ({
  page,
}) => {
  // A fresh visitor: the welcome dialog is up first and is audited as well.
  await page.goto('/')
  await expect(page.getByTestId('welcome-dialog')).toBeVisible()
  expect(await audit(page)).toEqual([])
  await page.getByTestId('welcome-start').click()
  await expect(page.locator('.preview-canvas svg')).toBeVisible()
  const serious = await audit(page)
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
})

test('AI panel and dialogs have no serious accessibility violations', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sirenes:welcomed', '1'))
  await page.goto('/')
  await page.getByTestId('toggle-ai').click()
  await expect(page.getByTestId('ai-key-settings')).toBeVisible()
  expect(await audit(page)).toEqual([])
  await page.getByTestId('privacy-link').click()
  await expect(page.getByTestId('privacy-dialog')).toBeVisible()
  expect(await audit(page)).toEqual([])
})

test('dark theme keeps contrast', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sirenes:welcomed', '1'))
  await page.goto('/')
  await page.getByTestId('toggle-ui-theme').click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  expect(await audit(page)).toEqual([])
})
