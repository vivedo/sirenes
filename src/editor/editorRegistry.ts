import type { EditorView } from '@codemirror/view'

/** The live editor view, so other modules (AI accept, format) can apply undoable edits. */
let activeView: EditorView | null = null

export function setEditorView(view: EditorView | null) {
  activeView = view
}

export function getEditorView(): EditorView | null {
  return activeView
}
