import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { history, historyKeymap } from '@codemirror/commands'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { collabCompartment, historyCompartment, readOnlyCompartment } from '../editor/compartments'
import type { CollabSession } from './session'

/**
 * Bind the live editor to a session: the document becomes the shared Y.Text, undo becomes the
 * session's per-user UndoManager, and remote cursors are drawn.
 */
export function attachCollab(view: EditorView, session: CollabSession) {
  const shared = session.ytext.toString()
  const current = view.state.doc.toString()
  // Two transactions: the content swap must be complete before yCollab starts observing.
  if (current !== shared)
    view.dispatch({ changes: { from: 0, to: current.length, insert: shared } })
  view.dispatch({
    effects: [
      historyCompartment.reconfigure([]),
      collabCompartment.reconfigure([
        yCollab(session.ytext, session.awareness, { undoManager: session.undoManager }),
        keymap.of(yUndoManagerKeymap),
      ]),
      readOnlyCompartment.reconfigure(readOnly(!session.canEdit)),
    ],
  })
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
