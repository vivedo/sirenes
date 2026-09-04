import mermaid from 'mermaid'
import type { MermaidTheme, RenderError } from '../store/types'

export const MERMAID_VERSION: string =
  typeof __MERMAID_VERSION__ === 'string' ? __MERMAID_VERSION__ : 'unknown'

let renderCount = 0
let lastTheme: MermaidTheme | null = null

function configure(theme: MermaidTheme) {
  if (lastTheme === theme) return
  lastTheme = theme
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    // Plain SVG labels render identically in PNG export and avoid foreignObject quirks.
    flowchart: { htmlLabels: false },
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  })
}

/** Turn whatever Mermaid threw into a message plus a best-effort 1-based line number. */
export function toRenderError(err: unknown): RenderError {
  const message = err instanceof Error ? err.message : String(err)
  let line: number | null = null

  const hash = (err as { hash?: { loc?: { first_line?: number } } })?.hash
  if (typeof hash?.loc?.first_line === 'number') line = hash.loc.first_line

  if (line === null) {
    const m = /Parse error on line (\d+)/i.exec(message)
    if (m) line = Number(m[1])
  }
  // Mermaid sometimes reports "Error: ... line: 3"
  if (line === null) {
    const m = /\bline:?\s*(\d+)/i.exec(message)
    if (m) line = Number(m[1])
  }

  return { message: message.split('\n')[0].trim(), line }
}

export interface RenderOutcome {
  svg: string | null
  error: RenderError | null
}

/**
 * Parse and render Mermaid source. Never throws: a failed parse returns an error
 * and a null svg so the caller can keep the last good render on screen.
 */
export async function renderMermaid(source: string, theme: MermaidTheme): Promise<RenderOutcome> {
  if (source.trim() === '') return { svg: null, error: null }
  configure(theme)
  try {
    await mermaid.parse(source)
    const id = `sirenes-${++renderCount}`
    const { svg } = await mermaid.render(id, source)
    // mermaid.render leaves a temporary element around on failure paths; make sure it is gone.
    document.getElementById('d' + id)?.remove()
    return { svg, error: null }
  } catch (err) {
    return { svg: null, error: toRenderError(err) }
  }
}

/** Parse-only check, used by the AI proposal validation and tests. */
export async function validateMermaid(source: string): Promise<RenderError | null> {
  if (source.trim() === '') return null
  try {
    await mermaid.parse(source)
    return null
  } catch (err) {
    return toRenderError(err)
  }
}
