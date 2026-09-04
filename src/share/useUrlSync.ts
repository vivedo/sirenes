import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import { debounce } from '../shared/debounce'
import { newId } from '../shared/id'
import { decodeState, encodeState, isShareFragment, supportsCompression } from './codec'
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
      const { doc } = store
      const fragment = await encodeState({ code: doc.source, mermaidTheme: doc.mermaidTheme })
      // The document may have changed while we were compressing.
      const now = useDocumentStore.getState().doc
      if (now.source !== doc.source || now.mermaidTheme !== doc.mermaidTheme) return

      const status = classifyUrlLength(buildUrl(fragment))
      store.setUrlStatus(!supportsCompression() && status === 'ok' ? 'unsupported' : status)
      if (status === 'too-long') return // keep the last fragment that fit
      lastWritten = fragment
      writeFragment(fragment)
    }, URL_DEBOUNCE_MS)

    let prev = useDocumentStore.getState()
    const unsub = useDocumentStore.subscribe((s) => {
      const changed =
        s.doc.source !== prev.doc.source ||
        s.doc.mermaidTheme !== prev.doc.mermaidTheme ||
        s.hydrated !== prev.hydrated ||
        s.pendingAutosave !== prev.pendingAutosave
      prev = s
      if (changed) void sync()
    })
    void sync()

    const onHashChange = async () => {
      const fragment = readFragment()
      if (fragment === lastWritten || !isShareFragment(fragment)) return
      try {
        const state = await decodeState(fragment)
        lastWritten = fragment
        useDocumentStore.getState().loadDocument({
          id: newId(),
          source: state.code,
          mermaidTheme: state.mermaidTheme,
          fileName: null,
          savedSource: null,
        })
        if (state.view === 'preview') useSettingsStore.getState().setLayout('preview')
      } catch {
        toast.error('That link does not contain a readable diagram.')
      }
    }
    window.addEventListener('hashchange', onHashChange)

    return () => {
      unsub()
      sync.cancel()
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])
}
