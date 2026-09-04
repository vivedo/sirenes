import { describe, expect, it } from 'vitest'
import { decideInitialDocument } from './bootstrap'
import type { DocumentState } from '../store/types'
import { DEFAULT_TEMPLATE } from '../documents/templates'

const autosave: DocumentState = {
  id: 'saved',
  source: 'graph LR\n  saved --> work',
  mermaidTheme: 'dark',
  fileName: 'work.mmd',
  savedSource: null,
}

describe('decideInitialDocument', () => {
  it('uses the template when nothing is stored', () => {
    const { doc, conflict } = decideInitialDocument(null, null)
    expect(doc.source).toBe(DEFAULT_TEMPLATE)
    expect(conflict).toBeNull()
  })

  it('restores autosave when there is no link', () => {
    const { doc, conflict } = decideInitialDocument(null, autosave)
    expect(doc).toBe(autosave)
    expect(conflict).toBeNull()
  })

  it('link wins and autosave is offered when they differ', () => {
    const { doc, conflict } = decideInitialDocument(
      { code: 'pie\n "a": 1', mermaidTheme: 'forest' },
      autosave,
    )
    expect(doc.source).toBe('pie\n "a": 1')
    expect(doc.mermaidTheme).toBe('forest')
    expect(doc.fileName).toBeNull()
    expect(conflict).toBe(autosave)
  })

  it('reuses the autosaved document when the link holds the same code', () => {
    const { doc, conflict } = decideInitialDocument(
      { code: autosave.source, mermaidTheme: 'default' },
      autosave,
    )
    expect(conflict).toBeNull()
    expect(doc.id).toBe('saved')
    expect(doc.fileName).toBe('work.mmd')
    expect(doc.mermaidTheme).toBe('default')
  })

  it('does not offer an empty autosave', () => {
    const { conflict } = decideInitialDocument(
      { code: 'graph TD', mermaidTheme: 'default' },
      { ...autosave, source: '   \n' },
    )
    expect(conflict).toBeNull()
  })
})
