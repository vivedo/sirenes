/**
 * Several diagrams can live in one .mmd file, separated by a Mermaid comment line that carries a
 * Sirenes marker, the diagram's stable id and its name:
 *
 *     %% sirenes:diagram k7m2p9qx4b Login flow
 *     flowchart TD
 *       ...
 *     %% sirenes:diagram 3nq8vtc2ha Payment sequence
 *     sequenceDiagram
 *       ...
 *
 * Mermaid ignores comment lines, so each section is still a plain diagram, and the marker is
 * distinctive enough not to be mistaken for an ordinary comment. The editor shows one section at
 * a time and never shows the separator itself. A file without separators is a single unnamed
 * diagram and is written back as plain Mermaid, so existing files are unaffected. The older
 * `%% --- name ---` form is still recognised when reading.
 */
import { shortId } from '../shared/id'

export interface Diagram {
  /** Stable identity, written to the file so AI threads and sessions survive reopening. */
  id: string
  /** null only for a lone, never-named diagram (plain .mmd compatibility). */
  name: string | null
  source: string
}

export function newDiagram(source: string, name: string | null = null, id = shortId()): Diagram {
  return { id, name, source }
}

export const SEPARATOR_RE = /^%%\s*sirenes:diagram\s+([A-Za-z0-9_-]+)(?:\s+(.*?))?\s*$/
/** Pre-1.1 separator, read but no longer written. */
export const LEGACY_SEPARATOR_RE = /^%%\s*---\s*(.+?)\s*---\s*$/

export function separatorLine(d: Pick<Diagram, 'id' | 'name'>, fallbackName: string): string {
  const name = (d.name ?? fallbackName).replace(/\r?\n/g, ' ').trim()
  return `%% sirenes:diagram ${d.id} ${name}`
}

/** Parse a separator line into id and name; null when the line is not a separator. */
export function parseSeparator(line: string): { id: string | null; name: string } | null {
  const m = SEPARATOR_RE.exec(line)
  if (m) return { id: m[1], name: (m[2] ?? '').trim() }
  const legacy = LEGACY_SEPARATOR_RE.exec(line)
  if (legacy) return { id: null, name: legacy[1] }
  return null
}

export function defaultDiagramName(index: number): string {
  return `Diagram ${index + 1}`
}

interface Section {
  id: string | null
  name: string | null
  lines: string[]
  header: boolean
}

/**
 * Split file text into diagrams. Always returns at least one. A section's source is everything
 * between its separator and the next one, including the line break of its last line, so that
 * serialising the sections again reproduces the file byte for byte.
 */
export function parseDiagrams(text: string): Diagram[] {
  const normalised = text.replace(/\r\n?/g, '\n')
  const lines = normalised.split('\n')
  const sections: { id: string | null; name: string | null; source: string }[] = []
  let current: Section = { id: null, name: null, lines: [], header: false }
  const finish = (terminated: boolean) => {
    const body = current.lines.join('\n') + (terminated && current.lines.length ? '\n' : '')
    // Text before the first separator only counts when it is not blank.
    if (current.header || body.trim() !== '')
      sections.push({ id: current.id, name: current.name, source: body })
  }
  for (const line of lines) {
    const sep = parseSeparator(line)
    if (sep) {
      finish(true)
      current = { id: sep.id, name: sep.name || null, lines: [], header: true }
    } else {
      current.lines.push(line)
    }
  }
  finish(false)
  if (sections.length === 0) return [newDiagram(normalised)]
  const seen = new Set<string>()
  return sections.map((sec) => {
    // Ids from the file are kept unless missing or duplicated.
    let id = sec.id && !seen.has(sec.id) ? sec.id : shortId()
    while (seen.has(id)) id = shortId()
    seen.add(id)
    return newDiagram(sec.source, sec.name, id)
  })
}

/** Join diagrams back into file text. A lone unnamed diagram is written as-is. */
export function serializeDiagrams(diagrams: Diagram[]): string {
  if (diagrams.length === 1 && diagrams[0].name === null) return diagrams[0].source
  return diagrams
    .map((d, i) => {
      const body = d.source.endsWith('\n') || d.source === '' ? d.source : d.source + '\n'
      return `${separatorLine(d, defaultDiagramName(i))}\n${body}`
    })
    .join('')
}

export function isMultiDocument(text: string): boolean {
  return text.split(/\r?\n/).some((l) => parseSeparator(l) !== null)
}
