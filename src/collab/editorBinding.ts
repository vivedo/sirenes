import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { history, historyKeymap } from '@codemirror/commands'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { collabCompartment, historyCompartment, readOnlyCompartment } from '../editor/compartments'
import type { CollabSession } from './session'

/**
 * Bind the live editor to one diagram of a session: the document becomes that diagram's shared
 * Y.Text, undo becomes its per-user UndoManager, and remote cursors on it are drawn.
 * Returns false when the diagram does not exist in the session.
 */
export function attachCollab(view: EditorView, session: CollabSession, diagramId: string): boolean {
  const text = session.textFor(diagramId)
  const undoManager = session.undoManagerFor(diagramId)
  if (!text || !undoManager) return false
  const shared = text.toString()
  const current = view.state.doc.toString()
  // Three transactions, in order: detach any previous binding (so the swap below is not written
  // into the previously bound diagram), swap the content, then bind the new diagram.
  view.dispatch({ effects: collabCompartment.reconfigure([]) })
  if (current !== shared)
    view.dispatch({ changes: { from: 0, to: current.length, insert: shared } })
  view.dispatch({
    effects: [
      historyCompartment.reconfigure([]),
      collabCompartment.reconfigure([
        yCollab(text, session.awareness, { undoManager }),
        keymap.of(yUndoManagerKeymap),
      ]),
      readOnlyCompartment.reconfigure(readOnly(!session.canEdit && session.role === 'guest')),
    ],
  })
  session.setViewing(diagramId)
  return true
}

export function setCollabReadOnly(view: EditorView, isReadOnly: boolean) {
  view.dispatch({ effects: readOnlyCompartment.reconfigure(readOnly(isReadOnly)) })
}

/** Back to a plain local document; the text stays as it was last synced. */
export function detachCollab(view: EditorView) {
  view.dispatch({
    effects: [
      collabCompartment.reconfigure([]),
      historyCompartment.reconfigure([history(), keymap.of(historyKeymap)]),
      readOnlyCompartment.reconfigure([]),
    ],
  })
}

function readOnly(on: boolean) {
  return on ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
}
