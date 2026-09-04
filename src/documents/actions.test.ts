import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../shared/download', () => ({ downloadBlob: vi.fn(), copyText: vi.fn() }))

import { downloadBlob } from '../shared/download'
import {
  loadOpenedFile,
  performSaveAs,
  replaceDocument,
  saveDocument,
  startSaveAs,
} from './actions'
import { useSaveUiStore } from '../app/saveUiStore'
import { useDocumentStore, selectIsDirty, createBlankDocument } from '../store/documentStore'
import { useToastStore } from '../store/toastStore'

const md = '# Doc\n\n```mermaid\ngraph TD\n  A --> B\n```\n\ntail\n'

describe('document actions', () => {
  beforeEach(() => {
    useDocumentStore.setState({ doc: createBlankDocument() })
    useToastStore.setState({ toasts: [] })
    useSaveUiStore.getState().hide()
    vi.mocked(downloadBlob).mockReset()
  })

  it('opens a .mmd file as a clean document with its origin', () => {
    const ok = loadOpenedFile({
      name: 'flow.mmd',
      content: 'graph LR\n A',
      origin: { kind: 'local', handleKey: 'k1' },
    })
    expect(ok).toBe(true)
    const s = useDocumentStore.getState()
    expect(s.doc.source).toBe('graph LR\n A')
    expect(s.doc.fileName).toBe('flow.mmd')
    expect(s.doc.origin).toEqual({ kind: 'local', handleKey: 'k1' })
    expect(s.doc.markdown).toBeNull()
    expect(selectIsDirty(s)).toBe(false)
  })

  it('opens a Markdown file by extracting the mermaid block', () => {
    loadOpenedFile({ name: 'README.md', content: md, origin: { kind: 'local', handleKey: null } })
    const { doc } = useDocumentStore.getState()
    expect(doc.source).toBe('graph TD\n  A --> B\n')
    expect(doc.markdown?.before).toContain('```mermaid\n')
  })

  it('refuses Markdown without a block and unsupported extensions', () => {
    expect(
      loadOpenedFile({ name: 'x.md', content: '# no', origin: { kind: 'local', handleKey: null } }),
    ).toBe(false)
    expect(
      loadOpenedFile({ name: 'x.png', content: '', origin: { kind: 'local', handleKey: null } }),
    ).toBe(false)
    expect(useToastStore.getState().toasts.map((t) => t.kind)).toEqual(['error', 'error'])
  })

  it('performSaveAs writes spliced Markdown via the download fallback and marks the doc saved', async () => {
    loadOpenedFile({ name: 'README.md', content: md, origin: { kind: 'local', handleKey: null } })
    useDocumentStore.getState().setSource('graph TD\n  A --> C\n')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true)

    expect(await performSaveAs('local', { name: 'README.md' })).toBe(true)
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]
    expect(name).toBe('README.md')
    expect(await (blob as Blob).text()).toBe(
      '# Doc\n\n```mermaid\ngraph TD\n  A --> C\n```\n\ntail\n',
    )
    const s = useDocumentStore.getState()
    expect(selectIsDirty(s)).toBe(false)
    expect(s.doc.origin).toEqual({ kind: 'local', handleKey: null })
  })

  it('startSaveAs opens the save panel when the provider needs a name (no FSA in jsdom)', async () => {
    await startSaveAs('local')
    const ui = useSaveUiStore.getState()
    expect(ui.open).toBe(true)
    expect(ui.destination).toBe('local')
    expect(ui.name).toBe('diagram.mmd')
  })

  it('saveDocument on a never-saved document opens the save panel instead of saving', async () => {
    useDocumentStore.getState().setSource('graph LR\n A --> B')
    expect(await saveDocument()).toBe(false)
    expect(useSaveUiStore.getState().open).toBe(true)
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('saveDocument on a download-origin document downloads with the same name', async () => {
    loadOpenedFile({
      name: 'flow.mmd',
      content: 'graph LR\n A',
      origin: { kind: 'local', handleKey: null },
    })
    useDocumentStore.getState().setSource('graph LR\n A --> B')
    expect(await saveDocument()).toBe(true)
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('flow.mmd')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false)
  })

  it('replaceDocument sets dirty work aside with an Undo toast that restores it', () => {
    useDocumentStore.getState().setSource('graph TD\n  precious')
    replaceDocument(() => useDocumentStore.getState().newDocument({ source: 'pie' }), 'Opened x')
    expect(useDocumentStore.getState().doc.source).toBe('pie')
    const t = useToastStore.getState().toasts.at(-1)!
    expect(t.action?.label).toBe('Undo')
    t.action!.onClick()
    expect(useDocumentStore.getState().doc.source).toBe('graph TD\n  precious')
  })

  it('replaceDocument offers no undo when nothing was dirty', () => {
    replaceDocument(() => useDocumentStore.getState().newDocument({ source: 'pie' }), 'New')
    expect(useToastStore.getState().toasts.some((t) => t.action)).toBe(false)
  })
})
