import { beforeEach, describe, expect, it } from 'vitest'
import { clearAutosave, readAutosave, startAutosave, writeAutosave } from './autosave'
import { useDocumentStore, makeDocument } from '../store/documentStore'

describe('autosave', () => {
  beforeEach(async () => {
    await clearAutosave()
    useDocumentStore.setState({ pendingAutosave: null })
  })

  it('reads back what it wrote', async () => {
    const doc = useDocumentStore.getState().doc
    await writeAutosave(makeDocument({ ...doc, source: 'graph LR', diagrams: undefined }))
    const rec = await readAutosave()
    expect(rec?.doc.source).toBe('graph LR')
    expect(typeof rec?.savedAt).toBe('number')
  })

  it('returns null when empty', async () => {
    expect(await readAutosave()).toBeNull()
  })

  it('persists store changes after the debounce', async () => {
    const stop = startAutosave()
    useDocumentStore.getState().setSource('sequenceDiagram\n A->>B: hi')
    await new Promise((r) => setTimeout(r, 400))
    expect((await readAutosave())?.doc.source).toBe('sequenceDiagram\n A->>B: hi')
    stop()
  })

  it('does not write while a conflict is pending', async () => {
    useDocumentStore.setState({ pendingAutosave: useDocumentStore.getState().doc })
    const stop = startAutosave()
    useDocumentStore.getState().setSource('graph TD\n X')
    await new Promise((r) => setTimeout(r, 400))
    expect(await readAutosave()).toBeNull()
    stop()
  })
})

describe('autosave per browser tab', () => {
  beforeEach(async () => {
    await clearAutosave()
    useDocumentStore.setState({ pendingAutosave: null })
  })

  it("stores documents under their own ids and resumes this tab's document", async () => {
    const a = makeDocument({ id: 'doc-a', source: 'graph TD\n  A' })
    const b = makeDocument({ id: 'doc-b', source: 'pie\n  "b": 1' })
    await writeAutosave(a)
    await writeAutosave(b)
    // This tab last held b.
    expect((await readAutosave())?.doc.id).toBe('doc-b')
    // Another tab (no pointer) resumes the most recent document, and a's record still exists.
    sessionStorage.removeItem('sirenes:tab-doc')
    expect((await readAutosave())?.doc.id).toBe('doc-b')
    sessionStorage.setItem('sirenes:tab-doc', 'doc-a')
    expect((await readAutosave())?.doc.source).toBe('graph TD\n  A')
  })

  it('migrates a legacy single-document record', async () => {
    const { set } = await import('idb-keyval')
    const legacy = makeDocument({ id: 'old', source: 'graph LR\n  legacy' })
    await set('sirenes:document', { doc: legacy, savedAt: 1 })
    const rec = await readAutosave()
    expect(rec?.doc.id).toBe('old')
    sessionStorage.removeItem('sirenes:tab-doc')
    expect((await readAutosave())?.doc.id).toBe('old')
  })
})
