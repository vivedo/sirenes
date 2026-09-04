import { expect, test, type Page } from '@playwright/test'

async function stubFsa(page: Page, files: Record<string, string>) {
  await page.addInitScript((initial) => {
    const store: Record<string, string> = { ...initial }
    const w = window as unknown as Record<string, unknown>
    w.__fsa = { store, nextOpen: Object.keys(initial)[0] }
    const fsa = w.__fsa as { store: Record<string, string>; nextOpen: string }
    const makeHandle = (name: string) => ({
      kind: 'file',
      name,
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () => new File([fsa.store[name] ?? ''], name, { type: 'text/plain' }),
      createWritable: async () => ({
        write: async (content: string) => {
          fsa.store[name] = content
        },
        close: async () => {},
      }),
    })
    w.showOpenFilePicker = async () => [makeHandle(fsa.nextOpen)]
    w.showSaveFilePicker = async (opts: { suggestedName?: string }) =>
      makeHandle(opts.suggestedName ?? 'untitled.mmd')
  }, files)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.name === 'seeded') return
    window.name = 'seeded'
    localStorage.clear()
    localStorage.setItem('sirenes:welcomed', '1')
    indexedDB.deleteDatabase('keyval-store')
  })
})

test('add, rename, switch, and remove diagrams with undo; state survives reload', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('diagram-tab-0')).toContainText('Diagram 1')

  await page.getByTestId('diagram-tab-add').click()
  const input = page.getByTestId('diagram-tab-input')
  await expect(input).toBeVisible()
  await input.fill('Costs')
  await input.press('Enter')
  await expect(page.getByTestId('diagram-tab-1')).toContainText('Costs')
  await expect(page.getByTestId('diagram-tab-1')).toHaveAttribute('aria-pressed', 'true')

  // The new tab starts empty; type a pie chart.
  await expect(page.locator('.cm-content').first()).not.toContainText('flowchart')
  await page.locator('.cm-content').first().click()
  await page.keyboard.type('pie\n"Rent": 60\n"Food": 40')
  await expect(page.locator('.preview-canvas svg')).toContainText('Rent')

  // Switching shows the other diagram; the separator never appears in the editor.
  await page.getByTestId('diagram-tab-0').click()
  await expect(page.locator('.cm-content').first()).toContainText('flowchart TD')
  await expect(page.locator('.cm-content').first()).not.toContainText('%% ---')
  await expect(page.locator('.preview-canvas svg')).toContainText('Start')

  await page.reload()
  await expect(page.getByTestId('diagram-tab-1')).toContainText('Costs')
  // The tab that was active before the reload is active again.
  await expect(page.getByTestId('diagram-tab-0')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('diagram-tab-1').click()
  await expect(page.locator('.cm-content').first()).toContainText('"Rent": 60')

  // Clicking the active tab renames it.
  await page.getByTestId('diagram-tab-1').click()
  await page.getByTestId('diagram-tab-input').fill('Budget')
  await page.getByTestId('diagram-tab-input').press('Enter')
  await expect(page.getByTestId('diagram-tab-1')).toContainText('Budget')

  // Remove and undo.
  await page.getByTestId('diagram-tab-close-1').click()
  await expect(page.getByTestId('diagram-tab-1')).toHaveCount(0)
  await expect(page.locator('.cm-content').first()).toContainText('flowchart TD')
  await page.getByTestId('toast-action').click()
  await expect(page.getByTestId('diagram-tab-1')).toContainText('Budget')
  await expect(page.locator('.cm-content').first()).toContainText('"Rent": 60')
})

test('saves all diagrams into one .mmd with separators and reopens them as tabs', async ({
  page,
}) => {
  await stubFsa(page, {
    'multi.mmd':
      '%% sirenes:diagram lg1 Login\nflowchart TD\n  A --> B\n%% sirenes:diagram pay2 Payment\nsequenceDiagram\n  U->>S: pay\n',
  })
  await page.goto('/')
  await page.getByTestId('menu-file').click()
  await page.getByTestId('file-open').click()
  await expect(page.getByTestId('diagram-tab-0')).toContainText('Login')
  await expect(page.getByTestId('diagram-tab-1')).toContainText('Payment')
  await expect(page.locator('.cm-content').first()).toContainText('A --> B')

  await page.getByTestId('diagram-tab-1').click()
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('ControlOrMeta+End') // the file ends with a newline: cursor is on an empty last line
  await page.keyboard.type('  S-->>U: receipt')
  await page.keyboard.press('ControlOrMeta+S')
  await expect(page.getByTestId('toolbar-title')).not.toContainText('•')
  const saved = await page.evaluate(
    () =>
      (window as unknown as { __fsa: { store: Record<string, string> } }).__fsa.store['multi.mmd'],
  )
  expect(saved).toBe(
    '%% sirenes:diagram lg1 Login\nflowchart TD\n  A --> B\n%% sirenes:diagram pay2 Payment\nsequenceDiagram\n  U->>S: pay\n  S-->>U: receipt\n',
  )

  // Export names follow the active diagram.
  await page.getByTestId('menu-export').click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download SVG' }).click()
  expect((await download).suggestedFilename()).toBe('Payment.svg')
})

test('share links carry every diagram', async ({ page, context }) => {
  await page.goto('/')
  await page.getByTestId('diagram-tab-add').click()
  await page.getByTestId('diagram-tab-input').fill('Second')
  await page.getByTestId('diagram-tab-input').press('Enter')
  await page.locator('.cm-content').first().click()
  await page.keyboard.type('pie\n"x": 1')
  await expect.poll(() => page.evaluate(() => location.hash.length)).toBeGreaterThan(40)
  const other = await context.newPage()
  await other.goto(page.url())
  await expect(other.getByTestId('diagram-tab-1')).toContainText('Second')
  await expect(other.getByTestId('diagram-tab-1')).toHaveAttribute('aria-pressed', 'true')
  await expect(other.locator('.cm-content').first()).toContainText('"x": 1')
  await other.getByTestId('diagram-tab-0').click()
  await expect(other.locator('.cm-content').first()).toContainText('flowchart TD')
})
