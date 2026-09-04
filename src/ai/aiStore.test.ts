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
import { useAiStore } from './aiStore'
import { useDocumentStore, createBlankDocument } from '../store/documentStore'

const mockedStream = vi.mocked(streamChat)

describe('aiStore.send', () => {
  beforeEach(() => {
    useAiStore.setState({
      apiKey: 'k',
      keyStatus: 'valid',
      messages: [],
      streaming: false,
      conversationDocId: null,
    })
    useDocumentStore.setState({
      doc: createBlankDocument({ source: 'graph TD\n A-->B\n' }),
      render: { svg: null, error: null, rendering: false },
    })
    mockedStream.mockReset()
  })

  it('streams a reply, extracts and validates the proposal, records usage', async () => {
    mockedStream.mockImplementation(async (opts) => {
      opts.onDelta?.('Added C.\n```mermaid\ngraph TD\n A-->B\n B-->C\n```')
      return {
        content: 'Added C.\n```mermaid\ngraph TD\n A-->B\n B-->C\n```',
        usage: { promptTokens: 5, completionTokens: 7, cost: 0.001 },
        finishReason: 'stop',
      }
    })
    await useAiStore.getState().send('add C')
    const msgs = useAiStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'add C' })
    expect(msgs[1].proposal).toEqual({
      code: 'graph TD\n A-->B\n B-->C\n',
      error: null,
      applied: false,
    })
    expect(msgs[1].usage?.completionTokens).toBe(7)
    expect(useAiStore.getState().streaming).toBe(false)

    // The prompt carried the current source and the request.
    const sent = mockedStream.mock.calls[0][0].messages
    expect(sent[0].role).toBe('system')
    expect(sent.at(-1)!.content).toContain('graph TD\n A-->B')
  })

  it('flags invalid proposals', async () => {
    mockedStream.mockResolvedValue({
      content: '```mermaid\nBROKEN\n```',
      usage: null,
      finishReason: 'stop',
    })
    await useAiStore.getState().send('break it')
    expect(useAiStore.getState().messages[1].proposal?.error).toEqual({
      message: 'Parse error',
      line: 1,
    })
  })

  it('does not propose when the reply equals the current source', async () => {
    mockedStream.mockResolvedValue({
      content: '```mermaid\ngraph TD\n A-->B\n```',
      usage: null,
      finishReason: 'stop',
    })
    await useAiStore.getState().send('no-op')
    expect(useAiStore.getState().messages[1].proposal).toBeUndefined()
  })

  it('records errors and marks the key invalid on 401', async () => {
    const { OpenRouterError } = await vi.importActual<typeof import('./openrouter')>('./openrouter')
    mockedStream.mockRejectedValue(new OpenRouterError('Invalid API key.', 401))
    await useAiStore.getState().send('x')
    expect(useAiStore.getState().messages[1].error).toMatch(/Invalid API key/)
    expect(useAiStore.getState().keyStatus).toBe('invalid')
  })

  it('applyProposal calls the applier and marks it applied; reject removes it', async () => {
    mockedStream.mockResolvedValue({
      content: '```mermaid\ngraph LR\n X\n```',
      usage: null,
      finishReason: 'stop',
    })
    await useAiStore.getState().send('x')
    const id = useAiStore.getState().messages[1].id
    const apply = vi.fn()
    useAiStore.getState().applyProposal(id, apply)
    expect(apply).toHaveBeenCalledWith('graph LR\n X\n')
    expect(useAiStore.getState().messages[1].proposal?.applied).toBe(true)

    useAiStore.getState().rejectProposal(id)
    expect(useAiStore.getState().messages[1].proposal).toBeUndefined()
  })

  it('cancel aborts the in-flight request', async () => {
    mockedStream.mockImplementation(
      (opts) =>
        new Promise((_, reject) =>
          opts.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const p = useAiStore.getState().send('slow')
    expect(useAiStore.getState().streaming).toBe(true)
    useAiStore.getState().cancel()
    await p
    expect(useAiStore.getState().messages[1].error).toBe('Cancelled')
    expect(useAiStore.getState().streaming).toBe(false)
  })
})
