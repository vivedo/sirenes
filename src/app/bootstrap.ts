import {
  useDocumentStore,
  createBlankDocument,
  makeDocument,
  documentText,
} from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import type { DocumentState, ShareState } from '../store/types'
import { readAutosave } from '../documents/autosave'
import { decodeState, isShareFragment } from '../share/codec'
import { readFragment } from '../share/urlState'
import { noteFragmentWritten } from '../share/useUrlSync'
import { newId } from '../shared/id'
import { getDriveConfig, parseDriveDeepLink, stripQuery, useDriveStore } from '../storage/drive'
import { HOST_RESUME_KEY, useCollabStore } from '../collab/collabStore'

/** Same diagrams (names and sources) regardless of ids. */
function sameContent(doc: DocumentState, url: ShareState): boolean {
  const urlDiagrams = url.diagrams ?? [{ name: null, source: url.code }]
  if (urlDiagrams.length !== doc.diagrams.length) return false
  return urlDiagrams.every((d, i) => {
    const o = doc.diagrams[i]
    return o.source === d.source && (urlDiagrams.length === 1 || o.name === d.name)
  })
}

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
    // Compare by content, not by serialized text: links do not carry diagram ids, so the
    // separators would differ even when the diagrams are identical.
    if (fromAutosave && sameContent(fromAutosave, fromUrl)) {
      return { doc: { ...fromAutosave, theme: fromUrl.theme }, conflict: null }
    }
    const doc: DocumentState = makeDocument({
      id: newId(),
      source: fromUrl.code,
      diagrams: fromUrl.diagrams,
      active: fromUrl.active,
      theme: fromUrl.theme,
    })
    const autosaveDiffers =
      fromAutosave !== null &&
      documentText(fromAutosave).trim() !== '' &&
      !sameContent(fromAutosave, fromUrl)
    return { doc, conflict: autosaveDiffers ? fromAutosave : null }
  }
  if (fromAutosave) return { doc: fromAutosave, conflict: null }
  return { doc: createBlankDocument(), conflict: null }
}

export const LIVE_PREFIX = 'live:'
/** Fragment used by "New file": start this tab with an empty document instead of resuming one. */
export const NEW_FRAGMENT = 'new'

export async function bootstrap(): Promise<void> {
  const fragment = readFragment()
  const liveId = fragment.startsWith(LIVE_PREFIX) ? fragment.slice(LIVE_PREFIX.length) : null
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

  const store = useDocumentStore.getState()
  if (fragment === NEW_FRAGMENT) {
    store.loadDocument(createBlankDocument({ source: '' }))
  } else {
    const autosave = await readAutosave()
    const { doc, conflict } = decideInitialDocument(fromUrl, autosave?.doc ?? null)
    store.loadDocument(doc)
    if (conflict) store.setPendingAutosave(conflict)
  }
  if (fromUrl?.view === 'preview') {
    const settings = useSettingsStore.getState()
    settings.setLayout('preview')
    settings.toggleAiPanel(false)
  }
  store.setHydrated()
  if (urlError) toast.warn(urlError)

  if (liveId) {
    let resume: string | null = null
    try {
      resume = sessionStorage.getItem(HOST_RESUME_KEY)
    } catch {
      /* ignore */
    }
    // The host reloading its own tab resumes the session under the same id; anyone else joins.
    if (resume === liveId) void useCollabStore.getState().startHosting(liveId)
    else useCollabStore.getState().setPendingJoin(liveId)
  }

  // Drive "Open with" and ?driveId= links. Sign-in needs a click, so surface a banner.
  const driveId = parseDriveDeepLink(location.search)
  if (driveId) {
    stripQuery()
    if (getDriveConfig()) useDriveStore.getState().setPendingOpenId(driveId)
    else
      toast.warn(
        'This deployment is not connected to Google Drive, so the linked file cannot be opened.',
      )
  }
}
