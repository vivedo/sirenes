import { create } from 'zustand'
import type { DocumentState, RenderResult, UrlStatus } from './types'
import { DEFAULT_THEME, type ThemeId } from '../themes/registry'
import type { DocumentOrigin, MarkdownWrapper } from '../storage/types'
import { defaultDiagramName, serializeDiagrams, type Diagram } from '../documents/multi'
import { newId } from '../shared/id'
import { DEFAULT_TEMPLATE } from '../documents/templates'

export interface NewDocumentOptions {
  source?: string
  /** Several diagrams; overrides `source`. */
  diagrams?: Diagram[]
  active?: number
  theme?: ThemeId
  fileName?: string | null
  /** When true the new document is considered saved (e.g. just opened from a file). */
  saved?: boolean
  id?: string
  origin?: DocumentOrigin | null
  markdown?: MarkdownWrapper | null
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
  /** Multi-diagram documents. */
  addDiagram: (source?: string, name?: string) => void
  switchDiagram: (index: number) => void
  renameDiagram: (index: number, name: string) => void
  /** Removes a diagram and returns it (for Undo). Refuses to remove the last one. */
  removeDiagram: (index: number) => Diagram | null
  insertDiagram: (index: number, diagram: Diagram, activate?: boolean) => void
  newDocument: (opts?: NewDocumentOptions) => void
  /** Replace the whole document, used by hydration and URL loading. */
  loadDocument: (doc: DocumentState) => void
  markSaved: (fileName?: string | null, origin?: DocumentOrigin | null) => void
  setRenderResult: (result: Partial<RenderResult>) => void
  setUrlStatus: (status: UrlStatus) => void
  setHydrated: () => void
  setPendingAutosave: (doc: DocumentState | null) => void
  resolveConflict: (keep: 'url' | 'autosave') => void
}

export function createBlankDocument(opts: NewDocumentOptions = {}): DocumentState {
  const diagrams: Diagram[] =
    opts.diagrams && opts.diagrams.length
      ? opts.diagrams
      : [{ name: null, source: opts.source ?? DEFAULT_TEMPLATE }]
  const active = Math.min(Math.max(0, opts.active ?? 0), diagrams.length - 1)
  return {
    id: opts.id ?? newId(),
    source: diagrams[active].source,
    diagrams,
    active,
    theme: opts.theme ?? DEFAULT_THEME,
    fileName: opts.fileName ?? null,
    savedSource: opts.saved ? serializeDiagrams(diagrams) : null,
    origin: opts.origin ?? null,
    markdown: opts.markdown ?? null,
  }
}

/** Build a full DocumentState from parts, keeping `source` and `diagrams` consistent. */
export function makeDocument(
  parts: Partial<DocumentState> & Pick<DocumentState, 'source'>,
): DocumentState {
  const base = createBlankDocument({
    source: parts.source,
    diagrams: parts.diagrams,
    active: parts.active,
  })
  return { ...base, ...parts, source: base.source, diagrams: base.diagrams, active: base.active }
}

/** File text for the whole document (all diagrams), before any Markdown wrapping. */
export function documentText(doc: DocumentState): string {
  return serializeDiagrams(doc.diagrams)
}

function withActiveSource(doc: DocumentState, source: string): DocumentState {
  const diagrams = doc.diagrams.map((d, i) => (i === doc.active ? { ...d, source } : d))
  return { ...doc, source, diagrams }
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
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

  setSource: (source) =>
    set((s) => (s.doc.source === source ? s : { doc: withActiveSource(s.doc, source) })),
  addDiagram: (source = '', name) =>
    set((s) => {
      const diagrams = s.doc.diagrams.map((d, i) => ({
        ...d,
        name: d.name ?? defaultDiagramName(i),
      }))
      diagrams.push({ name: name ?? defaultDiagramName(diagrams.length), source })
      const active = diagrams.length - 1
      return { doc: { ...s.doc, diagrams, active, source } }
    }),
  switchDiagram: (index) =>
    set((s) => {
      if (index === s.doc.active || index < 0 || index >= s.doc.diagrams.length) return s
      return { doc: { ...s.doc, active: index, source: s.doc.diagrams[index].source } }
    }),
  renameDiagram: (index, name) =>
    set((s) => {
      const clean = name.replace(/\r?\n/g, ' ').trim()
      if (!clean || !s.doc.diagrams[index]) return s
      return {
        doc: {
          ...s.doc,
          diagrams: s.doc.diagrams.map((d, i) => (i === index ? { ...d, name: clean } : d)),
        },
      }
    }),
  removeDiagram: (index) => {
    const s = get()
    if (s.doc.diagrams.length <= 1 || !s.doc.diagrams[index]) return null
    const removed = s.doc.diagrams[index]
    const diagrams = s.doc.diagrams.filter((_, i) => i !== index)
    const active = Math.min(
      s.doc.active > index ? s.doc.active - 1 : s.doc.active,
      diagrams.length - 1,
    )
    set({ doc: { ...s.doc, diagrams, active, source: diagrams[active].source } })
    return removed
  },
  insertDiagram: (index, diagram, activate = true) =>
    set((s) => {
      const diagrams = [...s.doc.diagrams]
      const at = Math.min(Math.max(0, index), diagrams.length)
      diagrams.splice(at, 0, diagram)
      const active = activate ? at : s.doc.active >= at ? s.doc.active + 1 : s.doc.active
      return { doc: { ...s.doc, diagrams, active, source: diagrams[active].source } }
    }),
  setTheme: (theme) => set((s) => ({ doc: { ...s.doc, theme } })),
  // New documents keep the current theme unless one is given explicitly.
  newDocument: (opts) =>
    set((s) => ({ doc: createBlankDocument({ theme: s.doc.theme, ...opts }) })),
  loadDocument: (doc) => set({ doc }),
  markSaved: (fileName, origin) =>
    set((s) => ({
      doc: {
        ...s.doc,
        savedSource: documentText(s.doc),
        fileName: fileName === undefined ? s.doc.fileName : fileName,
        origin: origin === undefined ? s.doc.origin : origin,
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
  const text = documentText(s.doc)
  if (s.doc.savedSource === null) return text.trim() !== '' && text !== DEFAULT_TEMPLATE
  return text !== s.doc.savedSource
}

// Test builds expose the store so end-to-end tests can load sources without typing them.
if (import.meta.env.VITE_COLLAB_TRANSPORT === 'fake' && typeof window !== 'undefined') {
  ;(window as unknown as { __doc: typeof useDocumentStore }).__doc = useDocumentStore
}
