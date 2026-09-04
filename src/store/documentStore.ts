import { create } from 'zustand'
import type { DocumentState, RenderResult, UrlStatus } from './types'
import { DEFAULT_THEME, type ThemeId } from '../themes/registry'
import { newId } from '../shared/id'
import { DEFAULT_TEMPLATE } from '../documents/templates'

export interface NewDocumentOptions {
  source?: string
  theme?: ThemeId
  fileName?: string | null
  /** When true the new document is considered saved (e.g. just opened from a file). */
  saved?: boolean
  id?: string
}

interface DocumentStore {
  doc: DocumentState
  render: RenderResult
  urlStatus: UrlStatus
  /** True once autosave / URL bootstrap has finished. */
  hydrated: boolean
  /** Set at boot when the URL and the autosave disagree; the user picks one. */
  pendingAutosave: DocumentState | null

  setSource: (source: string) => void
  setTheme: (theme: ThemeId) => void
  newDocument: (opts?: NewDocumentOptions) => void
  /** Replace the whole document, used by hydration and URL loading. */
  loadDocument: (doc: DocumentState) => void
  markSaved: (fileName?: string | null) => void
  setRenderResult: (result: Partial<RenderResult>) => void
  setUrlStatus: (status: UrlStatus) => void
  setHydrated: () => void
  setPendingAutosave: (doc: DocumentState | null) => void
  resolveConflict: (keep: 'url' | 'autosave') => void
}

export function createBlankDocument(opts: NewDocumentOptions = {}): DocumentState {
  const source = opts.source ?? DEFAULT_TEMPLATE
  return {
    id: opts.id ?? newId(),
    source,
    theme: opts.theme ?? DEFAULT_THEME,
    fileName: opts.fileName ?? null,
    savedSource: opts.saved ? source : null,
  }
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  doc: createBlankDocument(),
  render: {
    svg: null,
    ascii: null,
    asciiError: null,
    error: null,
    rendering: false,
    engine: 'mermaid',
    fallback: null,
  },
  urlStatus: 'ok',
  hydrated: false,
  pendingAutosave: null,

  setSource: (source) => set((s) => (s.doc.source === source ? s : { doc: { ...s.doc, source } })),
  setTheme: (theme) => set((s) => ({ doc: { ...s.doc, theme } })),
  // New documents keep the current theme unless one is given explicitly.
  newDocument: (opts) =>
    set((s) => ({ doc: createBlankDocument({ theme: s.doc.theme, ...opts }) })),
  loadDocument: (doc) => set({ doc }),
  markSaved: (fileName) =>
    set((s) => ({
      doc: {
        ...s.doc,
        savedSource: s.doc.source,
        fileName: fileName === undefined ? s.doc.fileName : fileName,
      },
    })),
  setRenderResult: (result) => set((s) => ({ render: { ...s.render, ...result } })),
  setUrlStatus: (urlStatus) => set((s) => (s.urlStatus === urlStatus ? s : { urlStatus })),
  setHydrated: () => set({ hydrated: true }),
  setPendingAutosave: (pendingAutosave) => set({ pendingAutosave }),
  resolveConflict: (keep) =>
    set((s) =>
      keep === 'autosave' && s.pendingAutosave
        ? { doc: s.pendingAutosave, pendingAutosave: null }
        : { pendingAutosave: null },
    ),
}))

/** Dirty relative to the last file save. A never-saved doc is dirty once it differs from the template. */
export function selectIsDirty(s: DocumentStore): boolean {
  const { source, savedSource } = s.doc
  if (savedSource === null) return source.trim() !== '' && source !== DEFAULT_TEMPLATE
  return source !== savedSource
}
