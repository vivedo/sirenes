import type { Engine, MermaidTheme, RenderError } from '../store/types'
import { getTheme, type ThemeId } from '../themes/registry'
import {
  BEAUTIFUL_SUPPORT_NOTE,
  isBeautifulSupported,
  renderAscii as renderAsciiWithBeautiful,
  renderBeautifulSvg,
} from './beautifulEngine'

export const MERMAID_VERSION: string =
  typeof __MERMAID_VERSION__ === 'string' ? __MERMAID_VERSION__ : 'unknown'

let renderCount = 0
let lastTheme: MermaidTheme | null = null

type Mermaid = typeof import('mermaid').default
let mermaidPromise: Promise<Mermaid> | null = null

/** Mermaid core is large; load it on first use so the shell paints first. */
export function loadMermaid(): Promise<Mermaid> {
  return (mermaidPromise ??= import('mermaid').then((m) => m.default))
}

function configure(mermaid: Mermaid, theme: MermaidTheme) {
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
  if (line === null) {
    const m = /\bline:?\s*(\d+)/i.exec(message)
    if (m) line = Number(m[1])
  }

  return { message: message.split('\n')[0].trim(), line }
}

export interface RenderOutcome {
  svg: string | null
  error: RenderError | null
  engine: Engine
  fallback: string | null
}

async function renderWithMermaid(source: string, theme: MermaidTheme): Promise<string> {
  const mermaid = await loadMermaid()
  configure(mermaid, theme)
  const id = `sirenes-${++renderCount}`
  const { svg } = await mermaid.render(id, source)
  document.getElementById('d' + id)?.remove()
  return svg
}

/**
 * Parse with Mermaid (the authoritative parser, with line numbers), then draw with the engine the
 * theme asks for. Never throws: a failed parse returns an error and a null svg so the caller can
 * keep the last good render on screen.
 */
export async function renderDiagram(source: string, themeId: ThemeId): Promise<RenderOutcome> {
  const theme = getTheme(themeId)
  const base: RenderOutcome = { svg: null, error: null, engine: 'mermaid', fallback: null }
  if (source.trim() === '') return base

  try {
    const mermaid = await loadMermaid()
    await mermaid.parse(source)
  } catch (err) {
    return { ...base, error: toRenderError(err) }
  }

  if (theme.engine === 'beautiful') {
    if (isBeautifulSupported(source)) {
      try {
        const svg = await renderBeautifulSvg(source, theme.id as never)
        return { ...base, svg, engine: 'beautiful' }
      } catch (err) {
        const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
        base.fallback = `The beautiful engine could not draw this diagram (${reason}). Rendered with Mermaid.`
      }
    } else {
      base.fallback = `${BEAUTIFUL_SUPPORT_NOTE} Rendered with Mermaid.`
    }
  }

  try {
    const svg = await renderWithMermaid(source, theme.mermaidFallback)
    return { ...base, svg }
  } catch (err) {
    return { ...base, error: toRenderError(err) }
  }
}

/** Text rendering. Resolves to an error string instead of throwing so the UI can show it inline. */
export async function renderAscii(
  source: string,
  plain: boolean,
): Promise<{ ascii: string | null; error: string | null }> {
  if (source.trim() === '') return { ascii: null, error: null }
  if (!isBeautifulSupported(source))
    return {
      ascii: null,
      error: `ASCII rendering supports the same types as beautiful themes. ${BEAUTIFUL_SUPPORT_NOTE}`,
    }
  try {
    return { ascii: await renderAsciiWithBeautiful(source, { plain }), error: null }
  } catch (err) {
    return { ascii: null, error: err instanceof Error ? err.message.split('\n')[0] : String(err) }
  }
}

/** Parse-only check, used by the AI proposal validation and tests. */
export async function validateMermaid(source: string): Promise<RenderError | null> {
  if (source.trim() === '') return null
  try {
    const mermaid = await loadMermaid()
    await mermaid.parse(source)
    return null
  } catch (err) {
    return toRenderError(err)
  }
}
