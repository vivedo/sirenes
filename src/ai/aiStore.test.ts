import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./openrouter', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./openrouter')>()
  return { ...mod, streamChat: vi.fn(), validateKey: vi.fn(), listModels: vi.fn() }
})
vi.mock('../preview/renderer', () => ({
  validateMermaid: vi.fn(async (src: string) =>
    src.includes('BROKEN') ? { message: 'Parse error', line: 1 } : null,
  ),
}))

import { streamChat } from './openrouter'
import { activeThreadKey, selectActiveThread, useAiStore } from './aiStore'
import { threadKey } from './history'
import { useDocumentStore, createBlankDocument } from '../store/documentStore'

const mockedStream = vi.mocked(streamChat)
const active = () => selectActiveThread(useAiStore.getState())

describe('aiStore.send', () => {
  beforeEach(async () => {
    useDocumentStore.setState({
      doc: createBlankDocument({ source: 'graph TD\n A-->B\n' }),
      render: {
        svg: null,
        ascii: null,
        asciiError: null,
        error: null,
        rendering: false,
        engine: 'mermaid',
        fallback: null,
      },
    })
    useAiStore.setState({ apiKey: 'k', keyStatus: 'valid', threads: {}, activeKey: null })
    await useAiStore.getState().activateThread(activeThreadKey())
    mockedStream.mockReset()
  })

  it('streams a reply into the active thread, extracts and validates the proposal, records usage', async () => {
    mockedStream.mockImplementation(async (opts) => {
      opts.onDelta?.('Added C.\n```mermaid\ngraph TD\n A-->B\n B-->C\n```')
      return {
        content: 'Added C.\n```mermaid\ngraph TD\n A-->B\n B-->C\n```',
        usage: { promptTokens: 5, completionTokens: 7, cost: 0.001 },
        finishReason: 'stop',
      }
    })
    await useAiStore.getState().send('add C')
    const msgs = active().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'add C' })
    expect(msgs[1].proposal).toEqual({
      code: 'graph TD\n A-->B\n B-->C\n',
      error: null,
      applied: false,
    })
    expect(msgs[1].usage?.completionTokens).toBe(7)
    expect(active().streaming).toBe(false)
    const sent = mockedStream.mock.calls[0][0].messages
    expect(sent[0].role).toBe('system')
    expect(sent.at(-1)!.content).toContain('graph TD\n A-->B')
  })

  it('keeps one thread per diagram', async () => {
    mockedStream.mockResolvedValue({ content: 'ok', usage: null, finishReason: 'stop' })
    await useAiStore.getState().send('first diagram')
    useDocumentStore.getState().addDiagram('pie\n', 'Costs')
    const secondKey = activeThreadKey()
    await useAiStore.getState().activateThread(secondKey)
    expect(active().messages).toHaveLength(0)
    await useAiStore.getState().send('second diagram')
    expect(active().messages.map((m) => m.content)).toEqual(['second diagram', 'ok'])
    // The source sent for the second diagram is the pie, not the flowchart.
    expect(mockedStream.mock.calls[1][0].messages.at(-1)!.content).toContain('pie')
    useDocumentStore.getState().switchDiagram(0)
    await useAiStore.getState().activateThread(activeThreadKey())
    expect(active().messages.map((m) => m.content)).toEqual(['first diagram', 'ok'])
  })

  it('can target another thread and source explicitly (host executing a guest request)', async () => {
    mockedStream.mockResolvedValue({
      content: '```mermaid\npie\n "x": 1\n```',
      usage: null,
      finishReason: 'stop',
    })
    const key = threadKey(useDocumentStore.getState().doc.id, 'other-diagram')
    await useAiStore
      .getState()
      .send('make a pie', 'edit', { key, source: 'pie\n', author: 'Grace' })
    const t = useAiStore.getState().threads[key]
    expect(t.messages[0]).toMatchObject({ author: 'Grace' })
    expect(t.messages[1].proposal?.code).toBe('pie\n "x": 1\n')
    expect(mockedStream.mock.calls[0][0].messages.at(-1)!.content).toContain('```mermaid\npie\n```')
    expect(active().messages).toHaveLength(0)
  })

  it('flags invalid proposals', async () => {
    mockedStream.mockResolvedValue({
      content: '```mermaid\nBROKEN\n```',
      usage: null,
      finishReason: 'stop',
    })
    await useAiStore.getState().send('break it')
    expect(active().messages[1].proposal?.error).toEqual({ message: 'Parse error', line: 1 })
  })

  it('does not propose when the reply equals the current source', async () => {
    mockedStream.mockResolvedValue({
      content: '```mermaid\ngraph TD\n A-->B\n```',
      usage: null,
      finishReason: 'stop',
    })
    await useAiStore.getState().send('no-op')
    expect(active().messages[1].proposal).toBeUndefined()
  })

  it('records errors and marks the key invalid on 401', async () => {
    const { OpenRouterError } = await vi.importActual<typeof import('./openrouter')>('./openrouter')
    mockedStream.mockRejectedValue(new OpenRouterError('Invalid API key.', 401))
    await useAiStore.getState().send('x')
    expect(active().messages[1].error).toMatch(/Invalid API key/)
    expect(useAiStore.getState().keyStatus).toBe('invalid')
  })

  it('applyProposal calls the applier and records who applied; reject removes it', async () => {
    mockedStream.mockResolvedValue({
      content: '```mermaid\ngraph LR\n X\n```',
      usage: null,
      finishReason: 'stop',
    })
    await useAiStore.getState().send('x')
    const id = active().messages[1].id
    const apply = vi.fn()
    useAiStore.getState().applyProposal(id, apply, 'Ada')
    expect(apply).toHaveBeenCalledWith('graph LR\n X\n')
    expect(active().messages[1]).toMatchObject({ proposal: { applied: true }, appliedBy: 'Ada' })
    useAiStore.getState().rejectProposal(id)
    expect(active().messages[1].proposal).toBeUndefined()
  })

  it('cancel aborts the in-flight request of the active thread', async () => {
    mockedStream.mockImplementation(
      (opts) =>
        new Promise((_, reject) =>
          opts.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const p = useAiStore.getState().send('slow')
    expect(active().streaming).toBe(true)
    useAiStore.getState().cancel()
    await p
    expect(active().messages[1].error).toBe('Cancelled')
    expect(active().streaming).toBe(false)
  })
})
