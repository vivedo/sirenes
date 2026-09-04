import { describe, expect, it } from 'vitest'
import { isMultiDocument, parseDiagrams, separatorLine, serializeDiagrams } from './multi'

const two = `%% --- Login ---
flowchart TD
  A --> B
%% --- Payment ---
sequenceDiagram
  U->>S: pay
`

describe('multi-diagram files', () => {
  it('a plain file is one unnamed diagram and round-trips byte for byte', () => {
    const src = 'graph TD\n  A --> B\n'
    const ds = parseDiagrams(src)
    expect(ds).toEqual([{ name: null, source: src }])
    expect(serializeDiagrams(ds)).toBe(src)
    expect(isMultiDocument(src)).toBe(false)
  })

  it('splits on separator lines and hides them from the sources', () => {
    const ds = parseDiagrams(two)
    expect(ds.map((d) => d.name)).toEqual(['Login', 'Payment'])
    expect(ds[0].source).toBe('flowchart TD\n  A --> B\n')
    expect(ds[1].source).toBe('sequenceDiagram\n  U->>S: pay\n')
    expect(ds.some((d) => d.source.includes('%% ---'))).toBe(false)
    expect(isMultiDocument(two)).toBe(true)
  })

  it('round-trips a multi-diagram file', () => {
    expect(serializeDiagrams(parseDiagrams(two))).toBe(two)
  })

  it('keeps unnamed content before the first separator as its own diagram', () => {
    const ds = parseDiagrams('graph LR\n  x\n%% --- Second ---\npie\n')
    expect(ds).toEqual([
      { name: null, source: 'graph LR\n  x\n' },
      { name: 'Second', source: 'pie\n' },
    ])
    // Serialising names the first one so the file stays parseable.
    expect(serializeDiagrams(ds)).toBe(
      '%% --- Diagram 1 ---\ngraph LR\n  x\n%% --- Second ---\npie\n',
    )
  })

  it('ignores blank leading text and tolerates CRLF and odd spacing', () => {
    const ds = parseDiagrams('\r\n%%--- A ---\r\ngraph TD\r\n%%   ---   B   ---   \r\npie\r\n')
    expect(ds.map((d) => d.name)).toEqual(['A', 'B'])
    expect(ds[0].source).toBe('graph TD\n')
  })

  it('separatorLine strips newlines from names', () => {
    expect(separatorLine(' Multi\nline ')).toBe('%% --- Multi line ---')
  })
})
