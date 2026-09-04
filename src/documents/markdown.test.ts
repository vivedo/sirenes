import { describe, expect, it } from 'vitest'
import { extractMermaid, serializeForFile, spliceMermaid } from './markdown'

const readme = `# Title

Some intro text.

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

More text.

\`\`\`js
console.log('not a diagram')
\`\`\`
`

describe('markdown round-trip', () => {
  it('extracts the first mermaid block and keeps the surroundings', () => {
    const ex = extractMermaid(readme)!
    expect(ex.code).toBe('graph TD\n  A --> B\n')
    expect(ex.count).toBe(1)
    expect(ex.wrapper.before.endsWith('```mermaid\n')).toBe(true)
    expect(ex.wrapper.after.startsWith('\n```\n\nMore text.')).toBe(true)
  })

  it('round-trips unchanged code byte for byte', () => {
    const ex = extractMermaid(readme)!
    expect(spliceMermaid(ex.wrapper, ex.code)).toBe(readme)
  })

  it('splices edited code and leaves everything else alone', () => {
    const ex = extractMermaid(readme)!
    const out = spliceMermaid(ex.wrapper, 'graph LR\n  X --> Y\n  Y --> Z\n')
    expect(out).toContain('```mermaid\ngraph LR\n  X --> Y\n  Y --> Z\n```\n\nMore text.')
    expect(out.startsWith('# Title\n\nSome intro text.')).toBe(true)
    expect(out).toContain("console.log('not a diagram')")
  })

  it('counts multiple blocks, supports ~~~ fences and indentation, normalises CRLF', () => {
    const md = 'a\r\n  ~~~mermaid\r\n  pie\r\n  ~~~\r\n\r\n```mermaid\ngraph TD\n```\n'
    const ex = extractMermaid(md)!
    expect(ex.count).toBe(2)
    expect(ex.code).toBe('  pie\n')
  })

  it('returns null without a mermaid block', () => {
    expect(extractMermaid('# nothing\n```js\nx\n```')).toBeNull()
  })

  it('serializeForFile passes plain sources through', () => {
    expect(serializeForFile('graph TD', null)).toBe('graph TD')
  })
})
