/**
 * Mermaid has no canonical formatter. This does the safe, obviously-correct part:
 * trims trailing whitespace, normalises line endings, collapses runs of blank lines,
 * and guarantees a single trailing newline.
 */
export function formatMermaid(source: string): string {
  const lines = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
  const out: string[] = []
  let blank = 0
  for (const line of lines) {
    if (line === '') {
      blank++
      if (blank > 1) continue
    } else blank = 0
    out.push(line)
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') + (out.length ? '\n' : '')
}
