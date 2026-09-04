import { beforeEach, describe, expect, it } from 'vitest'
import {
  createBlankDocument,
  documentText,
  makeDocument,
  selectIsDirty,
  useDocumentStore,
} from './documentStore'
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

  it('newDocument gets a fresh id, the template by default, and keeps the current theme', () => {
    useDocumentStore.getState().setTheme('tokyo-night')
    const before = useDocumentStore.getState().doc.id
    useDocumentStore.getState().newDocument()
    const after = useDocumentStore.getState().doc
    expect(after.id).not.toBe(before)
    expect(after.source).toBe(DEFAULT_TEMPLATE)
    expect(after.theme).toBe('tokyo-night')
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

describe('documentStore diagrams', () => {
  beforeEach(() =>
    useDocumentStore.setState({ doc: createBlankDocument({ source: 'graph TD\n  A\n' }) }),
  )

  it('adds a diagram, names both, switches, and keeps sources per tab', () => {
    const s = useDocumentStore.getState()
    s.addDiagram('pie\n', 'Shares')
    let d = useDocumentStore.getState().doc
    expect(d.diagrams.map((x) => x.name)).toEqual(['Diagram 1', 'Shares'])
    expect(d.active).toBe(1)
    expect(d.source).toBe('pie\n')
    useDocumentStore.getState().setSource('pie\n  "a": 1\n')
    useDocumentStore.getState().switchDiagram(0)
    d = useDocumentStore.getState().doc
    expect(d.source).toBe('graph TD\n  A\n')
    expect(d.diagrams[1].source).toBe('pie\n  "a": 1\n')
  })

  it('serialises all diagrams for saving and tracks dirtiness on the whole file', () => {
    const s = useDocumentStore.getState()
    s.addDiagram('pie\n', 'Shares')
    expect(documentText(useDocumentStore.getState().doc)).toBe(
      '%% --- Diagram 1 ---\ngraph TD\n  A\n%% --- Shares ---\npie\n',
    )
    useDocumentStore.getState().markSaved('multi.mmd')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false)
    useDocumentStore.getState().switchDiagram(0)
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false) // switching is not an edit
    useDocumentStore.getState().setSource('graph TD\n  A --> B\n')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true)
  })

  it('renames, removes (never the last), and re-inserts for undo', () => {
    const s = useDocumentStore.getState()
    s.addDiagram('pie\n')
    s.renameDiagram(1, '  Costs  ')
    expect(useDocumentStore.getState().doc.diagrams[1].name).toBe('Costs')
    const removed = useDocumentStore.getState().removeDiagram(1)
    expect(removed?.name).toBe('Costs')
    let d = useDocumentStore.getState().doc
    expect(d.diagrams).toHaveLength(1)
    expect(d.active).toBe(0)
    expect(d.source).toBe('graph TD\n  A\n')
    expect(useDocumentStore.getState().removeDiagram(0)).toBeNull()
    useDocumentStore.getState().insertDiagram(1, removed!)
    d = useDocumentStore.getState().doc
    expect(d.diagrams[1]).toEqual(removed)
    expect(d.active).toBe(1)
  })

  it('makeDocument keeps source and diagrams consistent', () => {
    const d = makeDocument({
      source: 'ignored',
      diagrams: [
        { name: 'a', source: 'A' },
        { name: 'b', source: 'B' },
      ],
      active: 1,
    })
    expect(d.source).toBe('B')
    expect(d.diagrams).toHaveLength(2)
  })
})
