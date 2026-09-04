import { describe, expect, it } from 'vitest'
import { extractMermaidBlock, stripMermaidBlocks } from './proposal'

describe('extractMermaidBlock', () => {
  it('prefers the last ```mermaid block', () => {
    const reply =
      'Before:\n```mermaid\ngraph TD\nA\n```\nAfter:\n```mermaid\ngraph TD\nA-->B\n```\n'
    expect(extractMermaidBlock(reply)).toBe('graph TD\nA-->B\n')
  })

  it('falls back to an untagged block that looks like a diagram', () => {
    expect(extractMermaidBlock('Here:\n```\nsequenceDiagram\nA->>B: hi\n```')).toBe(
      'sequenceDiagram\nA->>B: hi\n',
    )
  })

  it('ignores non-diagram code blocks', () => {
    expect(extractMermaidBlock('```js\nconsole.log(1)\n```')).toBeNull()
  })

  it('accepts a bare diagram reply', () => {
    expect(extractMermaidBlock('flowchart LR\n  a --> b')).toBe('flowchart LR\n  a --> b\n')
  })

  it('returns null for prose', () => {
    expect(extractMermaidBlock('This diagram shows a login flow.')).toBeNull()
  })

  it('handles directives at the start', () => {
    expect(extractMermaidBlock('```\n%%{init: {"theme":"dark"}}%%\ngraph TD\nA\n```')).toContain(
      '%%{init',
    )
  })
})

describe('stripMermaidBlocks', () => {
  it('removes fenced blocks and collapses whitespace', () => {
    expect(stripMermaidBlocks('Added C.\n\n```mermaid\ngraph TD\n```\n\n\nDone.')).toBe(
      'Added C.\n\nDone.',
    )
  })
})
