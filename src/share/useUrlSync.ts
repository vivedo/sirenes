import { useEffect } from 'react'
import { useDocumentStore, makeDocument } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import { debounce } from '../shared/debounce'
import { newId } from '../shared/id'
import { useCollabStore } from '../collab/collabStore'
import {
  decodeState,
  encodeState,
  isShareFragment,
  shareStateOf,
  supportsCompression,
} from './codec'
import { buildUrl, classifyUrlLength, readFragment, writeFragment } from './urlState'

const URL_DEBOUNCE_MS = 500

/** Last fragment this tab wrote, so our own replaceState never looks like external navigation. */
let lastWritten: string | null = null
export function noteFragmentWritten(fragment: string) {
  lastWritten = fragment
}

/**
 * Two-way sync between the document and the URL fragment.
 *  - store -> URL: debounced replaceState with the compressed diagram.
 *  - URL -> store: a hashchange we did not cause loads the diagram from the link.
 */
export function useUrlSync() {
  useEffect(() => {
    const sync = debounce(async () => {
      const store = useDocumentStore.getState()
      if (!store.hydrated || store.pendingAutosave) return
      // In a live session the address bar shows the live link instead.
      const collab = useCollabStore.getState()
      if (collab.session || collab.pendingJoin || collab.status === 'connecting') return
      const { doc } = store
      const fragment = await encodeState(shareStateOf(doc))
      // The document may have changed while we were compressing.
      const now = useDocumentStore.getState().doc
      if (now.diagrams !== doc.diagrams || now.active !== doc.active || now.theme !== doc.theme)
        return

      const status = classifyUrlLength(buildUrl(fragment))
      store.setUrlStatus(!supportsCompression() && status === 'ok' ? 'unsupported' : status)
      if (status === 'too-long') return // keep the last fragment that fit
      lastWritten = fragment
      writeFragment(fragment)
    }, URL_DEBOUNCE_MS)

    // When a session ends, resume publishing the static link.
    let prevCollab = useCollabStore.getState().session
    const unsubCollab = useCollabStore.subscribe((c) => {
      if (c.session === null && prevCollab !== null) void sync()
      prevCollab = c.session
    })

    let prev = useDocumentStore.getState()
    const unsub = useDocumentStore.subscribe((s) => {
      const changed =
        s.doc.diagrams !== prev.doc.diagrams ||
        s.doc.active !== prev.doc.active ||
        s.doc.theme !== prev.doc.theme ||
        s.hydrated !== prev.hydrated ||
        s.pendingAutosave !== prev.pendingAutosave
      prev = s
      if (changed) void sync()
    })
    void sync()

    const onHashChange = async () => {
      const fragment = readFragment()
      if (fragment === lastWritten || !isShareFragment(fragment)) return
      if (useCollabStore.getState().session) return
      try {
        const state = await decodeState(fragment)
        lastWritten = fragment
        useDocumentStore.getState().loadDocument(
          makeDocument({
            id: newId(),
            source: state.code,
            diagrams: state.diagrams,
            active: state.active,
            theme: state.theme,
          }),
        )
        if (state.view === 'preview') useSettingsStore.getState().setLayout('preview')
      } catch {
        toast.error('That link does not contain a readable diagram.')
      }
    }
    window.addEventListener('hashchange', onHashChange)

    return () => {
      unsub()
      unsubCollab()
      sync.cancel()
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])
}
