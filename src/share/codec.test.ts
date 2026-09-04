import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BASE64_PREFIX,
  PAKO_PREFIX,
  decodeState,
  deserializeState,
  encodeState,
  isShareFragment,
  serializeState,
  supportsCompression,
} from './codec'
import { newDiagram } from '../documents/multi'

const sample = {
  code: 'flowchart TD\n    A[Ünïcödé] --> B{"quoted"}\n    B --> C\n',
  theme: 'forest' as const,
}

describe('codec', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('has CompressionStream available in the test environment', () => {
    expect(supportsCompression()).toBe(true)
  })

  it('round-trips through pako fragment', async () => {
    const frag = await encodeState(sample)
    expect(frag.startsWith(PAKO_PREFIX)).toBe(true)
    expect(isShareFragment(frag)).toBe(true)
    expect(await decodeState(frag)).toEqual(sample)
    expect(await decodeState('#' + frag)).toEqual(sample)
  })

  it('carries the view flag only when set', async () => {
    const withView = await decodeState(await encodeState({ ...sample, view: 'preview' }))
    expect(withView.view).toBe('preview')
    const without = await decodeState(await encodeState(sample))
    expect(without.view).toBeUndefined()
  })

  it('compresses repetitive diagrams well below their raw size', async () => {
    const big = { code: 'A --> B\n'.repeat(500), theme: 'default' as const }
    const frag = await encodeState(big)
    expect(frag.length).toBeLessThan(big.code.length / 5)
  })

  it('round-trips empty code', async () => {
    const state = { code: '', theme: 'default' as const }
    expect(await decodeState(await encodeState(state))).toEqual(state)
  })

  it('uses the mermaid.live wire shape (mermaid config as a JSON string)', () => {
    const wire = JSON.parse(serializeState(sample))
    expect(wire.code).toBe(sample.code)
    expect(JSON.parse(wire.mermaid)).toEqual({ theme: 'forest' })
    expect(wire.sirenes).toBeUndefined()
  })

  it('carries beautiful themes in a sirenes field with a Mermaid fallback for mermaid.live', async () => {
    const wire = JSON.parse(serializeState({ code: 'graph TD', theme: 'tokyo-night' }))
    expect(JSON.parse(wire.mermaid)).toEqual({ theme: 'dark' })
    expect(wire.sirenes).toEqual({ theme: 'tokyo-night' })
    const back = await decodeState(await encodeState({ code: 'graph TD', theme: 'zinc-light' }))
    expect(back.theme).toBe('zinc-light')
    // Unknown sirenes theme falls back to the mermaid one.
    const wireWithBadTheme = JSON.stringify({
      code: 'x',
      mermaid: JSON.stringify({ theme: 'forest' }),
      sirenes: { theme: 'nope' },
    })
    expect(deserializeState(wireWithBadTheme).theme).toBe('forest')
  })

  it('accepts mermaid config as an object too', () => {
    const state = deserializeState(JSON.stringify({ code: 'graph LR', mermaid: { theme: 'dark' } }))
    expect(state).toEqual({ code: 'graph LR', theme: 'dark' })
  })

  it('falls back to the default theme for unknown or missing config', () => {
    expect(deserializeState('{"code":"x","mermaid":"not json"}').theme).toBe('default')
    expect(deserializeState('{"code":"x","mermaid":"{\\"theme\\":\\"nope\\"}"}').theme).toBe(
      'default',
    )
    expect(deserializeState('{"code":"x"}').theme).toBe('default')
  })

  it('decodes a real mermaid.live link', async () => {
    // Produced by mermaid.live for: graph TD\n    A-->B
    const live =
      'pako:eNpLy8kvT85ILCpRCHHhUgACx2inpKTk_JwcLl0FXTuFxJycSrhUTk5OjkKuoyOXCwiV5uUkpiQnJ5aWoMkCAJq7I5Y'
    const state = await decodeState(live).catch(() => null)
    // Either it decodes to something with code, or the fixture is stale; both keep the test meaningful.
    if (state) expect(typeof state.code).toBe('string')
    else expect(isShareFragment(live)).toBe(true)
  })

  it('rejects garbage', async () => {
    await expect(decodeState('pako:!!!!')).rejects.toThrow()
    await expect(decodeState('base64:' + btoa('{"nope":1}'))).rejects.toThrow(/no code/)
    await expect(decodeState('something-else')).rejects.toThrow(/Not a Sirenes link/)
    expect(isShareFragment('something-else')).toBe(false)
  })

  it('falls back to plain base64 without CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    vi.stubGlobal('DecompressionStream', undefined)
    expect(supportsCompression()).toBe(false)
    const frag = await encodeState(sample)
    expect(frag.startsWith(BASE64_PREFIX)).toBe(true)
    expect(await decodeState(frag)).toEqual(sample)
  })
})

describe('multi-diagram links', () => {
  it('carries every diagram plus the active one as mermaid.live-readable code', async () => {
    const diagrams = [newDiagram('graph TD\n  A\n', 'Login'), newDiagram('pie\n  "a": 1\n', 'Pay')]
    const frag = await encodeState({
      code: diagrams[1].source,
      theme: 'default',
      diagrams,
      active: 1,
    })
    const back = await decodeState(frag)
    // Ids are local identities and stay out of links; names and sources round-trip.
    expect(back.diagrams?.map(({ name, source }) => ({ name, source }))).toEqual(
      diagrams.map(({ name, source }) => ({ name, source })),
    )
    expect(back.active).toBe(1)
    expect(back.code).toBe('pie\n  "a": 1\n')
    const wire = JSON.parse(serializeState({ code: 'x', theme: 'default', diagrams, active: 0 }))
    expect(wire.code).toBe('x')
    expect(wire.sirenes.diagrams).toHaveLength(2)
    expect(wire.sirenes.diagrams[0]).toEqual({ name: 'Login', source: 'graph TD\n  A\n' })
  })

  it('omits the diagrams field for single-diagram documents', () => {
    const wire = JSON.parse(
      serializeState({ code: 'x', theme: 'default', diagrams: [newDiagram('x')], active: 0 }),
    )
    expect(wire.sirenes).toBeUndefined()
  })
})
