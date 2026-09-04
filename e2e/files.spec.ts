import { expect, test, type Page } from '@playwright/test'

/**
 * Native file pickers cannot be automated, so the File System Access API is stubbed with
 * in-memory handles. Writes are recorded on window.__fsa for assertions.
 */
async function stubFileSystemAccess(page: Page, files: Record<string, string>) {
  await page.addInitScript((initial) => {
    const store: Record<string, string> = { ...initial }
    const w = window as unknown as Record<string, unknown>
    w.__fsa = {
      store,
      writes: [] as { name: string; content: string }[],
      nextOpen: Object.keys(initial)[0],
    }
    const fsa = w.__fsa as {
      store: Record<string, string>
      writes: { name: string; content: string }[]
      nextOpen: string
    }
    const makeHandle = (name: string) => ({
      kind: 'file',
      name,
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () => new File([fsa.store[name] ?? ''], name, { type: 'text/plain' }),
      createWritable: async () => ({
        write: async (content: string) => {
          fsa.store[name] = content
          fsa.writes.push({ name, content })
        },
        close: async () => {},
      }),
    })
    w.showOpenFilePicker = async () => [makeHandle(fsa.nextOpen)]
    w.showSaveFilePicker = async (opts: { suggestedName?: string }) =>
      makeHandle((w.__saveAsName as string) ?? opts.suggestedName ?? 'untitled.mmd')
  }, files)
}

const README = '# Notes\n\nIntro.\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nOutro.\n'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.name === 'seeded') return
    window.name = 'seeded'
    localStorage.clear()
    indexedDB.deleteDatabase('keyval-store')
  })
})

test('open a .mmd file, edit, and save in place', async ({ page }) => {
  await stubFileSystemAccess(page, { 'flow.mmd': 'graph LR\n  one --> two\n' })
  await page.goto('/')
  await page.getByTestId('menu-file').click()
  await page.getByTestId('file-open').click()
  await expect(page.getByTestId('toolbar-title')).toContainText('flow.mmd')
  await expect(page.locator('.cm-content').first()).toContainText('one --> two')
  await expect(page.locator('.preview-canvas svg')).toContainText('two')
  await expect(page.getByTestId('toolbar-title')).not.toContainText('•')

  await page.locator('.cm-content').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('\n  two --> three')
  await expect(page.getByTestId('toolbar-title')).toContainText('•')
  await page.keyboard.press('ControlOrMeta+S')
  await expect(page.getByTestId('toolbar-title')).not.toContainText('•')
  const writes = await page.evaluate(
    () =>
      (window as unknown as { __fsa: { writes: { name: string; content: string }[] } }).__fsa
        .writes,
  )
  expect(writes).toHaveLength(1)
  expect(writes[0].name).toBe('flow.mmd')
  expect(writes[0].content).toContain('two --> three')

  // The file shows up in Recent and reopens from there after a reload.
  await page.reload()
  await page.getByTestId('menu-file').click()
  await expect(page.getByTestId('file-recent').first()).toContainText('flow.mmd')
})

test('Markdown files round-trip with only the mermaid block changed', async ({ page }) => {
  await stubFileSystemAccess(page, { 'README.md': README })
  await page.goto('/')
  await page.getByTestId('menu-file').click()
  await page.getByTestId('file-open').click()
  await expect(page.locator('.cm-content').first()).toContainText('A --> B')
  await expect(page.locator('.cm-content').first()).not.toContainText('Intro')

  await page.locator('.cm-content').first().click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('graph TD\n  A --> C')
  await page.keyboard.press('ControlOrMeta+S')
  const content = await page.evaluate(
    () =>
      (window as unknown as { __fsa: { store: Record<string, string> } }).__fsa.store['README.md'],
  )
  expect(content).toBe('# Notes\n\nIntro.\n\n```mermaid\ngraph TD\n  A --> C\n```\n\nOutro.\n')
})

test('Save as picks a new name and future saves go there', async ({ page }) => {
  await stubFileSystemAccess(page, {})
  await page.goto('/')
  await page.evaluate(
    () => ((window as unknown as { __saveAsName: string }).__saveAsName = 'renamed.mmd'),
  )
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.getByTestId('toolbar-title')).toContainText('renamed.mmd')
  const writes = await page.evaluate(
    () => (window as unknown as { __fsa: { writes: { name: string }[] } }).__fsa.writes,
  )
  expect(writes.map((w) => w.name)).toEqual(['renamed.mmd'])
})

test('dropping a file opens it', async ({ page }) => {
  await page.goto('/')
  const dt = await page.evaluateHandle(() => {
    const dt = new DataTransfer()
    dt.items.add(
      new File(['sequenceDiagram\n  X->>Y: dropped'], 'dropped.mmd', { type: 'text/plain' }),
    )
    return dt
  })
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt })
  await expect(page.getByTestId('dropzone')).toBeVisible()
  await page.dispatchEvent('body', 'drop', { dataTransfer: dt })
  await expect(page.getByTestId('dropzone')).toHaveCount(0)
  await expect(page.getByTestId('toolbar-title')).toContainText('dropped.mmd')
  await expect(page.locator('.cm-content').first()).toContainText('dropped')
})

test('without the File System Access API, open uses a file input and save downloads', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    delete w.showOpenFilePicker
    delete w.showSaveFilePicker
  })
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('menu-file').click()
  await page.getByTestId('file-open').click()
  await (
    await chooser
  ).setFiles({ name: 'legacy.mmd', mimeType: 'text/plain', buffer: Buffer.from('pie\n  "a": 1\n') })
  await expect(page.getByTestId('toolbar-title')).toContainText('legacy.mmd')

  await page.locator('.cm-content').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('\n  "b": 2')
  const download = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+S')
  expect((await download).suggestedFilename()).toBe('legacy.mmd')

  // Save as without FSA uses the in-app panel, not window.prompt.
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.getByTestId('save-panel')).toBeVisible()
  await page.getByTestId('save-name').fill('renamed-legacy.mmd')
  const download2 = page.waitForEvent('download')
  await page.getByTestId('save-submit').click()
  expect((await download2).suggestedFilename()).toBe('renamed-legacy.mmd')
  await expect(page.getByTestId('toolbar-title')).toContainText('renamed-legacy.mmd')
})
