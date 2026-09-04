import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatMermaid } from '../documents/format'
import { applySourceEdit } from '../editor/applySourceEdit'
import { copyShareLink } from '../share/shareLinks'
import {
  openFile,
  saveDocument,
  startNewDiagram,
  startNewDocument,
  startSaveAs,
} from '../documents/actions'

export function useKeyboardShortcuts(onShowShortcuts: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const inEditor = (e.target as HTMLElement)?.closest?.('.cm-editor') !== null
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)

      if (!mod && e.key === '?' && !inEditor && !inInput) {
        e.preventDefault()
        onShowShortcuts()
        return
      }
      if (!mod) return

      const store = useDocumentStore.getState()
      const settings = useSettingsStore.getState()
      // Until bootstrap has restored the document, file actions would be overwritten by it.
      if (!store.hydrated) return

      if (key === 's' && !e.shiftKey) {
        e.preventDefault()
        void saveDocument()
      } else if (key === 's' && e.shiftKey) {
        e.preventDefault()
        void startSaveAs('local')
      } else if (key === 'o' && !e.shiftKey) {
        e.preventDefault()
        void openFile()
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        startNewDocument()
      } else if (key === 'n' && e.shiftKey) {
        e.preventDefault()
        if (store.doc.markdown === null) startNewDiagram()
      } else if (key === 'a' && e.shiftKey) {
        e.preventDefault()
        settings.toggleAiPanel()
      } else if (key === 'f' && e.shiftKey) {
        e.preventDefault()
        applySourceEdit(formatMermaid(store.doc.source))
      } else if (key === 'l' && e.shiftKey) {
        e.preventDefault()
        void copyShareLink(false)
      } else if (['1', '2', '3'].includes(e.key) && !e.shiftKey && !inEditor) {
        e.preventDefault()
        settings.setLayout((['editor', 'split', 'preview'] as const)[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onShowShortcuts])
}
