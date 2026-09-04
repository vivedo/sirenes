import { describe, expect, it } from 'vitest'
import { decideInitialDocument } from './bootstrap'
import type { DocumentState } from '../store/types'
import { DEFAULT_TEMPLATE } from '../documents/templates'

const autosave: DocumentState = {
  id: 'saved',
  source: 'graph LR\n  saved --> work',
  theme: 'dark',
  fileName: 'work.mmd',
  savedSource: null,
  origin: null,
  markdown: null,
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
      { code: 'pie\n "a": 1', theme: 'forest' },
      autosave,
    )
    expect(doc.source).toBe('pie\n "a": 1')
    expect(doc.theme).toBe('forest')
    expect(doc.fileName).toBeNull()
    expect(conflict).toBe(autosave)
  })

  it('reuses the autosaved document when the link holds the same code', () => {
    const { doc, conflict } = decideInitialDocument(
      { code: autosave.source, theme: 'default' },
      autosave,
    )
    expect(conflict).toBeNull()
    expect(doc.id).toBe('saved')
    expect(doc.fileName).toBe('work.mmd')
    expect(doc.theme).toBe('default')
  })

  it('does not offer an empty autosave', () => {
    const { conflict } = decideInitialDocument(
      { code: 'graph TD', theme: 'default' },
      { ...autosave, source: '   \n' },
    )
    expect(conflict).toBeNull()
  })
})
