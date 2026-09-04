import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../shared/download', () => ({ downloadBlob: vi.fn(), copyText: vi.fn() }))

import { downloadBlob } from '../shared/download'
import { loadOpenedFile, saveDocument, saveDocumentAs } from './actions'
import { useDocumentStore, selectIsDirty, createBlankDocument } from '../store/documentStore'
import type { StorageProvider } from '../storage/types'
import { useToastStore } from '../store/toastStore'

const md = '# Doc\n\n```mermaid\ngraph TD\n  A --> B\n```\n\ntail\n'

describe('document actions', () => {
  beforeEach(() => {
    useDocumentStore.setState({ doc: createBlankDocument() })
    useToastStore.setState({ toasts: [] })
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

  it('saveAs writes the spliced Markdown and marks the document saved', async () => {
    loadOpenedFile({ name: 'README.md', content: md, origin: { kind: 'local', handleKey: null } })
    useDocumentStore.getState().setSource('graph TD\n  A --> C\n')
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true)

    const provider: StorageProvider = {
      id: 'local',
      open: async () => null,
      save: async () => {
        throw new Error('unused')
      },
      saveAs: vi.fn(async (_content: string, name: string) => ({
        name,
        origin: { kind: 'local' as const, handleKey: 'h9' },
      })),
    }
    expect(await saveDocumentAs(provider)).toBe(true)
    const written = vi.mocked(provider.saveAs).mock.calls[0]
    expect(written[0]).toBe('# Doc\n\n```mermaid\ngraph TD\n  A --> C\n```\n\ntail\n')
    expect(written[1]).toBe('README.md')
    const s = useDocumentStore.getState()
    expect(selectIsDirty(s)).toBe(false)
    expect(s.doc.origin).toEqual({ kind: 'local', handleKey: 'h9' })
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
})
