import { del, get, keys, set } from 'idb-keyval'
import type { DocumentState } from '../store/types'
import { useDocumentStore } from '../store/documentStore'
import { debounce } from '../shared/debounce'
import { newDiagram } from './multi'
import { newId } from '../shared/id'

/**
 * One document per browser tab. Each document is stored under its own key so several tabs can
 * hold different files without overwriting each other. A tab remembers which document it holds
 * in sessionStorage (per tab); a brand-new tab without a link resumes the most recent document.
 */
export const DOC_PREFIX = 'sirenes:doc:'
export const LAST_DOC_KEY = 'sirenes:last-doc'
export const TAB_DOC_KEY = 'sirenes:tab-doc'
/** Pre-multi-tab record; migrated on first read. */
export const LEGACY_KEY = 'sirenes:document'
const AUTOSAVE_DEBOUNCE_MS = 300

export interface AutosaveRecord {
  doc: DocumentState
  savedAt: number
}

function normalise(doc: DocumentState): DocumentState {
  doc.origin ??= null
  doc.markdown ??= null
  if (!Array.isArray(doc.diagrams) || doc.diagrams.length === 0) {
    doc.diagrams = [newDiagram(doc.source)]
    doc.active = 0
  }
  for (const d of doc.diagrams) d.id ??= newId()
  doc.active = Math.min(Math.max(0, doc.active ?? 0), doc.diagrams.length - 1)
  doc.source = doc.diagrams[doc.active].source
  return doc
}

function tabDocId(): string | null {
  try {
    return sessionStorage.getItem(TAB_DOC_KEY)
  } catch {
    return null
  }
}

function rememberTabDoc(id: string) {
  try {
    sessionStorage.setItem(TAB_DOC_KEY, id)
  } catch {
    /* ignore */
  }
}

async function readDoc(id: string): Promise<AutosaveRecord | null> {
  try {
    const rec = await get<AutosaveRecord>(DOC_PREFIX + id)
    if (!rec || typeof rec.doc?.source !== 'string') return null
    rec.doc = normalise(rec.doc)
    return rec
  } catch {
    return null
  }
}

/** The document this tab should resume: its own, else the most recent one, else a legacy record. */
export async function readAutosave(): Promise<AutosaveRecord | null> {
  const own = tabDocId()
  if (own) {
    const rec = await readDoc(own)
    if (rec) return rec
  }
  try {
    const last = await get<string>(LAST_DOC_KEY)
    if (last) {
      const rec = await readDoc(last)
      if (rec) return rec
    }
    const legacy = await get<AutosaveRecord>(LEGACY_KEY)
    if (legacy && typeof legacy.doc?.source === 'string') {
      legacy.doc = normalise(legacy.doc)
      await writeAutosave(legacy.doc)
      await del(LEGACY_KEY)
      return legacy
    }
  } catch {
    /* storage unavailable */
  }
  return null
}

export async function writeAutosave(doc: DocumentState): Promise<void> {
  rememberTabDoc(doc.id)
  try {
    await set(DOC_PREFIX + doc.id, { doc, savedAt: Date.now() } satisfies AutosaveRecord)
    await set(LAST_DOC_KEY, doc.id)
  } catch {
    // Storage may be unavailable (private mode, quota). The URL fragment still holds the work.
  }
}

/** Remove every stored document (used by "Clear all data" and tests). */
export async function clearAutosave(): Promise<void> {
  try {
    sessionStorage.removeItem(TAB_DOC_KEY)
  } catch {
    /* ignore */
  }
  try {
    for (const k of await keys()) {
      if (
        typeof k === 'string' &&
        (k.startsWith(DOC_PREFIX) || k === LAST_DOC_KEY || k === LEGACY_KEY)
      )
        await del(k)
    }
  } catch {
    /* ignore */
  }
}

/** Subscribe to the document store and persist changes. Returns an unsubscribe function. */
export function startAutosave(): () => void {
  const save = debounce((doc: DocumentState) => void writeAutosave(doc), AUTOSAVE_DEBOUNCE_MS)
  let prev = useDocumentStore.getState().doc
  // Write once at start so the document id is stable across reloads even if nothing is edited.
  if (!useDocumentStore.getState().pendingAutosave) void writeAutosave(prev)
  const unsub = useDocumentStore.subscribe((s) => {
    if (s.doc === prev) return
    // Document or diagram switches are written at once: a reload right after must not lose them.
    const switched = s.doc.id !== prev.id || s.doc.active !== prev.active
    prev = s.doc
    // While the user is choosing between the link and the autosave, do not clobber the autosave.
    if (s.pendingAutosave) return
    if (switched) save.flush(s.doc)
    else save(s.doc)
  })
  // A reload right after an edit or tab switch must not lose it to the debounce.
  const flush = () => {
    const s = useDocumentStore.getState()
    if (!s.pendingAutosave) save.flush(s.doc)
  }
  window.addEventListener('pagehide', flush)
  return () => {
    unsub()
    save.cancel()
    window.removeEventListener('pagehide', flush)
  }
}
