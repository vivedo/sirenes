import type { MarkdownWrapper } from '../storage/types'

const FENCE_RE = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*mermaid[ \t]*[^\n]*\n([\s\S]*?)\n?^\1\2[ \t]*$/im

export interface ExtractedMermaid {
  code: string
  wrapper: MarkdownWrapper
  /** Total number of mermaid blocks in the document. */
  count: number
}

/** Find the first ```mermaid block. Returns null when there is none. */
export function extractMermaid(markdown: string): ExtractedMermaid | null {
  const text = markdown.replace(/\r\n?/g, '\n')
  const m = FENCE_RE.exec(text)
  if (!m || m.index === undefined) return null
  const full = m[0]
  const code = m[3]
  const codeStart = m.index + full.indexOf(code, m[1].length + m[2].length)
  const codeEnd = codeStart + code.length
  const count = (text.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*mermaid\b/gim) ?? []).length
  return {
    code: code + '\n',
    wrapper: { before: text.slice(0, codeStart), after: text.slice(codeEnd) },
    count,
  }
}

/** Put the code back between the original surroundings, byte for byte outside the block. */
export function spliceMermaid(wrapper: MarkdownWrapper, code: string): string {
  return wrapper.before + code.replace(/\n$/, '') + wrapper.after
}

/** Content to write for a document: spliced Markdown or plain Mermaid. */
export function serializeForFile(source: string, wrapper: MarkdownWrapper | null): string {
  return wrapper ? spliceMermaid(wrapper, source) : source
}
