import { expect, test, type Page } from '@playwright/test'

const REPLY =
  'Added a retry loop.\n```mermaid\nflowchart TD\n    A[Start] --> B{Is it working?}\n    B -- Yes --> C[Ship it]\n    B -- No --> D[Debug]\n    D --> R[Retry]\n    R --> B\n    C --> E([Done])\n```'

async function mockOpenRouter(page: Page) {
  await page.route('https://openrouter.ai/api/v1/auth/key', (route) =>
    route.fulfill({
      json: { data: { label: 'e2e key', usage: 0.42, limit: 10, is_free_tier: false } },
    }),
  )
  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'test/fast',
            name: 'Test Fast',
            context_length: 32000,
            pricing: { prompt: '0.0000001', completion: '0.0000004' },
          },
          {
            id: 'test/smart',
            name: 'Test Smart',
            context_length: 200000,
            pricing: { prompt: '0.000003', completion: '0.000015' },
          },
        ],
      },
    }),
  )
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON() as { model: string; stream: boolean }
    const frames = [
      ...REPLY.match(/[\s\S]{1,20}/g)!.map((piece) =>
        JSON.stringify({ choices: [{ delta: { content: piece } }] }),
      ),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 60, cost: 0.00042 },
      }),
      '[DONE]',
    ]
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'x-model': body.model },
      body: frames.map((f) => `data: ${f}\n\n`).join(''),
    })
  })
}

test.beforeEach(async ({ page }) => {
  // Fresh storage for each test, but only on the first load so reloads keep their state.
  await page.addInitScript(() => {
    if (window.name === 'seeded') return
    window.name = 'seeded'
    localStorage.clear()
    sessionStorage.clear()
    indexedDB.deleteDatabase('keyval-store')
  })
  await mockOpenRouter(page)
})

test('enter key, pick a model, send a prompt, review and accept the proposal', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('toggle-ai').click()
  await expect(page.getByTestId('ai-key-settings')).toBeVisible()

  await page.getByTestId('ai-key-input').fill('sk-or-v1-e2e-0000000000')
  await page.getByTestId('ai-save-key').click()
  await expect(page.getByTestId('ai-input')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sirenes:openrouter-key'))).toBe(
    'sk-or-v1-e2e-0000000000',
  )

  await page.getByTestId('model-button').click()
  await page.getByTestId('model-search').fill('smart')
  await page.getByTestId('model-test/smart').click()
  await expect(page.getByTestId('model-button')).toContainText('Test Smart')

  await page.getByTestId('ai-input').fill('add a retry loop after debug')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-proposal')).toBeVisible()
  await expect(page.getByTestId('ai-msg-assistant')).toContainText('Added a retry loop.')
  await expect(page.getByTestId('ai-msg-assistant')).toContainText('120 in · 60 out')
  await expect(page.getByTestId('ai-msg-assistant')).toContainText('test/smart')

  await page.getByTestId('ai-review').click()
  await expect(page.getByTestId('diff-dialog')).toBeVisible()
  await expect(page.getByTestId('diff-dialog')).toContainText('Retry')
  await page.getByTestId('diff-accept').click()

  await expect(page.locator('.cm-content').first()).toContainText('R[Retry]')
  await expect(page.locator('.preview-canvas svg')).toContainText('Retry')
  await expect(page.getByTestId('ai-proposal')).toContainText('Applied')

  // One undo step restores the original.
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(page.locator('.cm-content').first()).not.toContainText('Retry')
})

test('reject discards the proposal and the conversation persists per document', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('toggle-ai').click()
  await page.getByTestId('ai-key-input').fill('sk-or-v1-e2e-0000000000')
  await page.getByTestId('ai-save-key').click()
  await page.getByTestId('preset-simplify').click()
  await expect(page.getByTestId('ai-proposal')).toBeVisible()
  await page.getByTestId('ai-reject').click()
  await expect(page.getByTestId('ai-proposal')).toHaveCount(0)
  await expect(page.locator('.cm-content').first()).not.toContainText('Retry')

  await page.reload()
  await expect(page.getByTestId('ai-msg-assistant')).toContainText('Added a retry loop.')
})

test('session-only key is not persisted to localStorage', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('toggle-ai').click()
  await page.getByText('This session only').click()
  await page.getByTestId('ai-key-input').fill('sk-or-v1-session-000000')
  await page.getByTestId('ai-save-key').click()
  await expect(page.getByTestId('ai-input')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sirenes:openrouter-key'))).toBeNull()
  expect(await page.evaluate(() => sessionStorage.getItem('sirenes:openrouter-key'))).toBe(
    'sk-or-v1-session-000000',
  )
  await page.getByTestId('ai-settings-toggle').click()
  await page.getByTestId('ai-remove-key').click()
  await expect(page.getByTestId('ai-key-input')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('sirenes:openrouter-key'))).toBeNull()
})

test('AI panel width can be dragged, is clamped, persists, and resets on double-click', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('toggle-ai').click()
  const panel = page.getByTestId('ai-panel')
  const resizer = page.getByTestId('ai-panel-resizer')
  const before = (await panel.boundingBox())!
  expect(Math.round(before.width)).toBe(360)

  const box = (await resizer.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + 200
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 150, y, { steps: 5 })
  await page.mouse.up()
  const after = (await panel.boundingBox())!
  expect(Math.round(after.width)).toBe(510)

  await page.reload()
  await expect(panel).toBeVisible()
  expect(Math.round((await panel.boundingBox())!.width)).toBe(510)

  // Cannot shrink below the minimum.
  await page.mouse.move(x - 150, y)
  await page.mouse.down()
  await page.mouse.move(x + 600, y, { steps: 5 })
  await page.mouse.up()
  expect(Math.round((await panel.boundingBox())!.width)).toBe(280)

  await resizer.dblclick()
  expect(Math.round((await panel.boundingBox())!.width)).toBe(360)
})
