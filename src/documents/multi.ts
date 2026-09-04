/**
 * Several diagrams can live in one .mmd file, separated by a Mermaid comment line:
 *
 *     %% --- Login flow ---
 *     flowchart TD
 *       ...
 *     %% --- Payment sequence ---
 *     sequenceDiagram
 *       ...
 *
 * Mermaid ignores comment lines, so each section is still a plain diagram. The editor shows one
 * section at a time and never shows the separator itself. A file without separators is a single
 * unnamed diagram and is written back as plain Mermaid, so existing files are unaffected.
 */
export interface Diagram {
  /** null only for a lone, never-named diagram (plain .mmd compatibility). */
  name: string | null
  source: string
}

export const SEPARATOR_RE = /^%%\s*---\s*(.+?)\s*---\s*$/

export function separatorLine(name: string): string {
  return `%% --- ${name.replace(/\r?\n/g, ' ').trim()} ---`
}

export function defaultDiagramName(index: number): string {
  return `Diagram ${index + 1}`
}

/**
 * Split file text into diagrams. Always returns at least one. A section's source is everything
 * between its separator and the next one, including the line break of its last line, so that
 * serialising the sections again reproduces the file byte for byte.
 */
export function parseDiagrams(text: string): Diagram[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  interface Section {
    name: string | null
    lines: string[]
  }
  const sections: Section[] = []
  let current: Section = { name: null, lines: [] }
  const finish = (terminated: boolean) => {
    const body = current.lines.join('\n') + (terminated && current.lines.length ? '\n' : '')
    // Text before the first separator only counts when it is not blank.
    if (current.name !== null || body.trim() !== '')
      sections.push({ name: current.name, lines: [body] })
  }
  for (const line of lines) {
    const m = SEPARATOR_RE.exec(line)
    if (m) {
      finish(true)
      current = { name: m[1], lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  finish(false)
  if (sections.length === 0) return [{ name: null, source: text.replace(/\r\n?/g, '\n') }]
  return sections.map((sec) => ({ name: sec.name, source: sec.lines[0] }))
}

/** Join diagrams back into file text. A lone unnamed diagram is written as-is. */
export function serializeDiagrams(diagrams: Diagram[]): string {
  if (diagrams.length === 1 && diagrams[0].name === null) return diagrams[0].source
  return diagrams
    .map((d, i) => {
      const body = d.source.endsWith('\n') || d.source === '' ? d.source : d.source + '\n'
      return `${separatorLine(d.name ?? defaultDiagramName(i))}\n${body}`
    })
    .join('')
}

export function isMultiDocument(text: string): boolean {
  return text.split(/\r?\n/).some((l) => SEPARATOR_RE.test(l))
}
