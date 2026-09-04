import { describe, expect, it } from 'vitest'
import { mermaidLanguage } from './mermaidLanguage'
import { highlightTree } from '@lezer/highlight'
import { classHighlighter } from '@lezer/highlight'

function tokens(src: string) {
  const tree = mermaidLanguage.parser.parse(src)
  const out: { text: string; cls: string }[] = []
  highlightTree(tree, classHighlighter, (from, to, cls) =>
    out.push({ text: src.slice(from, to), cls }),
  )
  return out
}

describe('mermaid language', () => {
  it('tokenises keywords, arrows, strings, comments and directives', () => {
    const src = `%%{init: {"theme":"dark"}}%%
%% a comment
flowchart LR
    A["label"] --> B
    subgraph S
    end`
    const t = tokens(src)
    const find = (text: string) => t.find((x) => x.text === text)?.cls
    expect(find('%%{init: {"theme":"dark"}}%%')).toBe('tok-meta')
    expect(find('%% a comment')).toBe('tok-comment')
    expect(find('flowchart')).toBe('tok-keyword')
    expect(find('LR')).toBe('tok-keyword')
    expect(find('"label"')).toBe('tok-string')
    expect(find('-->')).toBe('tok-operator')
    expect(find('subgraph')).toBe('tok-keyword')
    expect(find('end')).toBe('tok-keyword')
  })

  it('treats sequence arrows as operators', () => {
    const t = tokens('sequenceDiagram\n  A->>B: hi\n  B-->>A: yo')
    expect(t.filter((x) => x.cls === 'tok-operator').map((x) => x.text)).toEqual(['->>', '-->>'])
  })
})
