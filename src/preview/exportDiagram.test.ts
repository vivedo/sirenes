import { describe, expect, it } from 'vitest'
import { standaloneSvg, svgSize } from './exportDiagram'

const svg = '<svg id="x" viewBox="0 0 320.5 140" style="max-width: 320.5px;"><g/></svg>'

describe('exportDiagram', () => {
  it('reads the intrinsic size from the viewBox', () => {
    expect(svgSize(svg)).toEqual({ width: 321, height: 140 })
    expect(svgSize('<svg></svg>')).toBeNull()
  })

  it('adds namespaces and explicit dimensions', () => {
    const out = standaloneSvg(svg)
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(out).toContain('xmlns:xlink=')
    expect(out).toMatch(/width="321" height="140"/)
  })

  it('does not duplicate an existing xmlns', () => {
    const out = standaloneSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>')
    expect(out.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)).toHaveLength(1)
  })
})
