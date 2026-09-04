import { describe, expect, it } from 'vitest'
import { buildMessages, PRESETS, SYSTEM_PROMPT } from './prompt'

describe('buildMessages', () => {
  it('puts the system prompt first, history in the middle, request last with the source', () => {
    const msgs = buildMessages({
      source: 'graph TD\n A-->B',
      request: 'add C',
      mode: 'edit',
      history: [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'reply' },
      ],
    })
    expect(msgs[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(msgs[1]).toEqual({ role: 'user', content: 'earlier' })
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'reply' })
    const last = msgs[3]
    expect(last.role).toBe('user')
    expect(last.content).toContain('```mermaid\ngraph TD\n A-->B\n```')
    expect(last.content).toContain('Request: add C')
    expect(last.content).toContain('complete updated diagram')
  })

  it('includes the parse error when present', () => {
    const [, last] = buildMessages({
      source: 'graph TD\n A--',
      request: 'fix',
      mode: 'edit',
      history: [],
      error: { message: 'Parse error', line: 2 },
    })
    expect(last.content).toContain('fails to parse on line 2: Parse error')
  })

  it('uses explain phrasing and mentions an empty editor', () => {
    const [, last] = buildMessages({
      source: '   ',
      request: 'what is this',
      mode: 'explain',
      history: [],
    })
    expect(last.content).toContain('editor is currently empty')
    expect(last.content).toContain('Explain, in prose')
    expect(last.content).not.toContain('complete updated diagram')
  })

  it('trims history to maxHistory', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
    }))
    const msgs = buildMessages({ source: 'x', request: 'r', mode: 'edit', history, maxHistory: 4 })
    expect(msgs).toHaveLength(1 + 4 + 1)
    expect(msgs[1].content).toBe('m16')
  })

  it('presets produce distinct requests', () => {
    const texts = PRESETS.map((p) => p.request({ hasError: true, arg: 'sequence diagram' }))
    expect(new Set(texts).size).toBe(PRESETS.length)
    expect(
      PRESETS.find((p) => p.id === 'convert')!.request({ hasError: false, arg: 'ER diagram' }),
    ).toContain('ER diagram')
  })
})
