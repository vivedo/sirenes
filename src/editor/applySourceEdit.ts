import { useDocumentStore } from '../store/documentStore'
import { getEditorView } from './editorRegistry'

/** Replace the editor content as one undoable transaction, falling back to the store. */
export function applySourceEdit(source: string) {
  const view = getEditorView()
  if (view) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } })
  } else {
    useDocumentStore.getState().setSource(source)
  }
}
