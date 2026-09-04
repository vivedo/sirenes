import { get, set, del } from 'idb-keyval'
import type { DocumentState } from '../store/types'
import { useDocumentStore } from '../store/documentStore'
import { debounce } from '../shared/debounce'

export const AUTOSAVE_KEY = 'sirenes:document'
const AUTOSAVE_DEBOUNCE_MS = 300

export interface AutosaveRecord {
  doc: DocumentState
  savedAt: number
}

export async function readAutosave(): Promise<AutosaveRecord | null> {
  try {
    const rec = await get<AutosaveRecord>(AUTOSAVE_KEY)
    if (!rec || typeof rec.doc?.source !== 'string') return null
    return rec
  } catch {
    return null
  }
}

export async function writeAutosave(doc: DocumentState): Promise<void> {
  try {
    await set(AUTOSAVE_KEY, { doc, savedAt: Date.now() } satisfies AutosaveRecord)
  } catch {
    // Storage may be unavailable (private mode, quota). The URL fragment still holds the work.
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    await del(AUTOSAVE_KEY)
  } catch {
    /* ignore */
  }
}

/** Subscribe to the document store and persist changes. Returns an unsubscribe function. */
export function startAutosave(): () => void {
  const save = debounce((doc: DocumentState) => void writeAutosave(doc), AUTOSAVE_DEBOUNCE_MS)
  let prev = useDocumentStore.getState().doc
  const unsub = useDocumentStore.subscribe((s) => {
    if (s.doc === prev) return
    prev = s.doc
    // While the user is choosing between the link and the autosave, do not clobber the autosave.
    if (s.pendingAutosave) return
    save(s.doc)
  })
  return () => {
    unsub()
    save.cancel()
  }
}
