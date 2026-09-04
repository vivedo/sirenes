import { describe, expect, it } from 'vitest'
import { isBeautifulSupported, renderAscii, renderBeautifulSvg } from './beautifulEngine'

const flow = 'flowchart LR\n  A[Start] --> B{OK?}\n  B -- yes --> C[Done]'

describe('beautiful engine', () => {
  it('detects supported headers, including after directives and comments', () => {
    expect(isBeautifulSupported(flow)).toBe(true)
    expect(isBeautifulSupported('%%{init: {"theme":"dark"}}%%\nsequenceDiagram\n A->>B: x')).toBe(
      true,
    )
    expect(isBeautifulSupported('%% comment\ngraph TD\n A')).toBe(true)
    expect(isBeautifulSupported('stateDiagram-v2\n [*] --> A')).toBe(true)
    expect(isBeautifulSupported('pie\n "a": 1')).toBe(false)
    expect(isBeautifulSupported('gantt\n title x')).toBe(false)
    expect(isBeautifulSupported('mindmap\n root')).toBe(false)
  })

  it('renders an SVG with the theme colours and no web-font import', async () => {
    const svg = await renderBeautifulSvg(flow, 'zinc-dark')
    expect(svg).toContain('<svg')
    expect(svg).toContain('--bg:#18181B')
    expect(svg).toMatch(/viewBox="/)
    expect(svg).not.toContain('@import')
    expect(svg).not.toContain('fonts.googleapis.com')
    expect(svg).toContain('Start')
  })

  it('renders Unicode and plain ASCII text', async () => {
    const unicode = await renderAscii(flow, { plain: false })
    expect(unicode).toContain('┌')
    expect(unicode).toContain('Start')
    const plain = await renderAscii(flow, { plain: true })
    expect(plain).toContain('+')
    expect(plain).not.toContain('┌')
    expect(plain.includes(String.fromCharCode(27))).toBe(false) // no ANSI escapes
  })

  it('throws on unsupported diagram types', async () => {
    await expect(renderBeautifulSvg('pie\n "a": 1', 'zinc-light')).rejects.toThrow(
      /Invalid mermaid header/,
    )
  })
})
