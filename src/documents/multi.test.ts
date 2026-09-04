import { describe, expect, it } from 'vitest'
import {
  isMultiDocument,
  newDiagram,
  parseDiagrams,
  parseSeparator,
  separatorLine,
  serializeDiagrams,
} from './multi'

const plain = (ds: { name: string | null; source: string }[]) =>
  ds.map(({ name, source }) => ({ name, source }))

const two = `%% sirenes:diagram k7m2p9qx4b Login
flowchart TD
  A --> B
%% sirenes:diagram 3nq8vtc2ha Payment
sequenceDiagram
  U->>S: pay
`

describe('multi-diagram files', () => {
  it('a plain file is one unnamed diagram and round-trips byte for byte', () => {
    const src = 'graph TD\n  A --> B\n'
    const ds = parseDiagrams(src)
    expect(plain(ds)).toEqual([{ name: null, source: src }])
    expect(ds[0].id).toMatch(/^[a-z0-9]{10}$/)
    expect(serializeDiagrams(ds)).toBe(src)
    expect(isMultiDocument(src)).toBe(false)
  })

  it('splits on separator lines, keeps the ids, and hides the separators from the sources', () => {
    const ds = parseDiagrams(two)
    expect(ds.map((d) => d.name)).toEqual(['Login', 'Payment'])
    expect(ds.map((d) => d.id)).toEqual(['k7m2p9qx4b', '3nq8vtc2ha'])
    expect(ds[0].source).toBe('flowchart TD\n  A --> B\n')
    expect(ds[1].source).toBe('sequenceDiagram\n  U->>S: pay\n')
    expect(ds.some((d) => d.source.includes('sirenes:diagram'))).toBe(false)
    expect(isMultiDocument(two)).toBe(true)
  })

  it('round-trips a multi-diagram file', () => {
    expect(serializeDiagrams(parseDiagrams(two))).toBe(two)
  })

  it('keeps unnamed content before the first separator as its own diagram', () => {
    const ds = parseDiagrams('graph LR\n  x\n%% sirenes:diagram abc123 Second\npie\n')
    expect(plain(ds)).toEqual([
      { name: null, source: 'graph LR\n  x\n' },
      { name: 'Second', source: 'pie\n' },
    ])
    // Serialising names the first one so the file stays parseable, and keeps ids.
    expect(serializeDiagrams(ds)).toBe(
      `%% sirenes:diagram ${ds[0].id} Diagram 1\ngraph LR\n  x\n%% sirenes:diagram abc123 Second\npie\n`,
    )
  })

  it('reads the legacy "%% --- name ---" separator and rewrites it in the new form', () => {
    const ds = parseDiagrams('%% --- Login ---\ngraph TD\n%% --- Pay ---\npie\n')
    expect(plain(ds)).toEqual([
      { name: 'Login', source: 'graph TD\n' },
      { name: 'Pay', source: 'pie\n' },
    ])
    expect(serializeDiagrams(ds)).toMatch(
      /^%% sirenes:diagram [a-z0-9]{10} Login\ngraph TD\n%% sirenes:diagram [a-z0-9]{10} Pay\npie\n$/,
    )
  })

  it('de-duplicates ids found in a file and ignores ordinary comments', () => {
    const ds = parseDiagrams(
      '%% sirenes:diagram same A\n%% just a comment\ngraph TD\n%% sirenes:diagram same B\npie\n',
    )
    expect(ds[0].id).toBe('same')
    expect(ds[1].id).not.toBe('same')
    expect(ds[0].source).toBe('%% just a comment\ngraph TD\n')
    expect(parseSeparator('%% --- not really')).toBeNull()
    expect(parseSeparator('%% sirenes:diagram x9 Name with spaces ')).toEqual({
      id: 'x9',
      name: 'Name with spaces',
    })
  })

  it('ignores blank leading text and tolerates CRLF and odd spacing', () => {
    const ds = parseDiagrams(
      '\r\n%%sirenes:diagram a1 A\r\ngraph TD\r\n%%   sirenes:diagram   b2   B   \r\npie\r\n',
    )
    expect(ds.map((d) => d.name)).toEqual(['A', 'B'])
    expect(ds[0].source).toBe('graph TD\n')
  })

  it('separatorLine strips newlines from names and carries the id', () => {
    expect(separatorLine(newDiagram('', ' Multi\nline ', 'id123'), 'x')).toBe(
      '%% sirenes:diagram id123 Multi line',
    )
    expect(separatorLine(newDiagram('', null, 'id123'), 'Diagram 1')).toBe(
      '%% sirenes:diagram id123 Diagram 1',
    )
  })
})
