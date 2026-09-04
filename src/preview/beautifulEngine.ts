import type { BeautifulThemeId } from '../themes/registry'

type Lib = typeof import('beautiful-mermaid')
let libPromise: Promise<Lib> | null = null

/** beautiful-mermaid pulls in ELK (~1.5 MB), so it is only loaded when a beautiful theme is used. */
export function loadBeautiful(): Promise<Lib> {
  return (libPromise ??= import('beautiful-mermaid'))
}

/** Diagram headers the beautiful engine can draw. Everything else falls back to Mermaid. */
const SUPPORTED_HEADER =
  /^\s*(?:%%\{[\s\S]*?\}%%\s*)*(?:%%[^\n]*\n\s*)*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|xychart-beta)\b/

export function isBeautifulSupported(source: string): boolean {
  return SUPPORTED_HEADER.test(source)
}

export const BEAUTIFUL_SUPPORT_NOTE =
  'Beautiful themes support flowchart, sequence, class, state, ER and XY charts.'

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/** Remove the web-font @import the library emits; our CSP blocks it and the system stack is used anyway. */
function stripFontImport(svg: string): string {
  return svg.replace(/@import\s+url\([^)]*\);?/g, '')
}

export async function renderBeautifulSvg(
  source: string,
  themeId: BeautifulThemeId,
): Promise<string> {
  const lib = await loadBeautiful()
  const colors = lib.THEMES[themeId] ?? lib.DEFAULTS
  return stripFontImport(lib.renderMermaidSVG(source, { ...colors, font: FONT }))
}

export interface AsciiOptions {
  plain: boolean
}

export async function renderAscii(source: string, opts: AsciiOptions): Promise<string> {
  const lib = await loadBeautiful()
  return lib.renderMermaidASCII(source, { useAscii: opts.plain, colorMode: 'none' })
}

/** Background colour of a beautiful theme, for PNG export. */
export async function beautifulBackground(themeId: BeautifulThemeId): Promise<string> {
  const lib = await loadBeautiful()
  return lib.THEMES[themeId]?.bg ?? lib.DEFAULTS.bg
}
