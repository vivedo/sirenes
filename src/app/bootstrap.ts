import { useDocumentStore, createBlankDocument } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import type { DocumentState, ShareState } from '../store/types'
import { readAutosave } from '../documents/autosave'
import { decodeState, isShareFragment } from '../share/codec'
import { readFragment } from '../share/urlState'
import { noteFragmentWritten } from '../share/useUrlSync'
import { newId } from '../shared/id'

export interface BootDecision {
  doc: DocumentState
  /** Autosave to offer in a dialog when it disagrees with the link. */
  conflict: DocumentState | null
}

/** Pure decision: link wins, autosave is offered if it differs, otherwise fall back sensibly. */
export function decideInitialDocument(
  fromUrl: ShareState | null,
  fromAutosave: DocumentState | null,
): BootDecision {
  if (fromUrl) {
    // Same diagram in the link and the autosave (the normal reload case): keep the autosaved
    // identity so file name, saved state and AI history survive.
    if (fromAutosave && fromAutosave.source === fromUrl.code) {
      return { doc: { ...fromAutosave, theme: fromUrl.theme }, conflict: null }
    }
    const doc: DocumentState = {
      id: newId(),
      source: fromUrl.code,
      theme: fromUrl.theme,
      fileName: null,
      savedSource: null,
      origin: null,
      markdown: null,
    }
    const autosaveDiffers =
      fromAutosave !== null &&
      fromAutosave.source.trim() !== '' &&
      fromAutosave.source !== fromUrl.code
    return { doc, conflict: autosaveDiffers ? fromAutosave : null }
  }
  if (fromAutosave) return { doc: fromAutosave, conflict: null }
  return { doc: createBlankDocument(), conflict: null }
}

export async function bootstrap(): Promise<void> {
  const fragment = readFragment()
  let fromUrl: ShareState | null = null
  let urlError: string | null = null

  if (fragment && isShareFragment(fragment)) {
    try {
      fromUrl = await decodeState(fragment)
      noteFragmentWritten(fragment)
    } catch {
      urlError = 'That link does not contain a readable diagram. Opened your last session instead.'
    }
  }

  const autosave = await readAutosave()
  const { doc, conflict } = decideInitialDocument(fromUrl, autosave?.doc ?? null)

  const store = useDocumentStore.getState()
  store.loadDocument(doc)
  if (conflict) store.setPendingAutosave(conflict)
  if (fromUrl?.view === 'preview') {
    const settings = useSettingsStore.getState()
    settings.setLayout('preview')
    settings.toggleAiPanel(false)
  }
  store.setHydrated()
  if (urlError) toast.warn(urlError)
}
