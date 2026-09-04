import { beforeEach, describe, expect, it } from 'vitest'
import { createBlankDocument, selectIsDirty, useDocumentStore } from './documentStore'
import { DEFAULT_TEMPLATE } from '../documents/templates'

describe('documentStore', () => {
  beforeEach(() => useDocumentStore.setState({ doc: createBlankDocument(), pendingAutosave: null }))

  it('starts clean on the template and becomes dirty on edit', () => {
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false)
    useDocumentStore.getState().setSource('graph LR')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true)
  })

  it('markSaved clears dirty and records the file name', () => {
    const s = useDocumentStore.getState()
    s.setSource('graph LR')
    s.markSaved('x.mmd')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false)
    expect(useDocumentStore.getState().doc.fileName).toBe('x.mmd')
    useDocumentStore.getState().setSource('graph TD')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true)
  })

  it('newDocument gets a fresh id and the template by default', () => {
    const before = useDocumentStore.getState().doc.id
    useDocumentStore.getState().newDocument()
    const after = useDocumentStore.getState().doc
    expect(after.id).not.toBe(before)
    expect(after.source).toBe(DEFAULT_TEMPLATE)
  })

  it('resolveConflict can restore the autosave', () => {
    const pending = { ...createBlankDocument({ source: 'pie' }), id: 'p' }
    useDocumentStore.setState({ pendingAutosave: pending })
    useDocumentStore.getState().resolveConflict('autosave')
    expect(useDocumentStore.getState().doc.id).toBe('p')
    expect(useDocumentStore.getState().pendingAutosave).toBeNull()
  })

  it('resolveConflict("url") keeps the current document', () => {
    const current = useDocumentStore.getState().doc
    useDocumentStore.setState({ pendingAutosave: createBlankDocument({ source: 'pie' }) })
    useDocumentStore.getState().resolveConflict('url')
    expect(useDocumentStore.getState().doc).toBe(current)
  })
})
