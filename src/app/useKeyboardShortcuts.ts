import { useEffect } from 'react'
import { useDocumentStore, selectIsDirty } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatMermaid } from '../documents/format'
import { getEditorView } from '../editor/editorRegistry'
import { downloadBlob } from '../shared/download'
import { copyShareLink } from '../share/shareLinks'
import { documentBaseName } from '../documents/naming'

/** Replace the editor content as one undoable transaction, falling back to the store. */
export function applySourceEdit(source: string) {
  const view = getEditorView()
  if (view) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } })
  } else {
    useDocumentStore.getState().setSource(source)
  }
}

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

      if (key === 's' && !e.shiftKey) {
        e.preventDefault()
        const name = documentBaseName(store.doc.fileName)
        downloadBlob(
          new Blob([store.doc.source], { type: 'text/plain;charset=utf-8' }),
          `${name}.mmd`,
        )
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        if (
          selectIsDirty(store) &&
          !window.confirm('Discard the current diagram and start a new one?')
        )
          return
        store.newDocument({ source: '' })
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
