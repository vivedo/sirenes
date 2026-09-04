import { useEffect, useRef } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { mermaid } from '../editor/mermaidLanguage'
import { editorTheme } from '../editor/editorTheme'

interface Props {
  original: string
  proposed: string
  onAccept: () => void
  onReject: () => void
  onClose: () => void
  invalidMessage?: string | null
}

export function DiffDialog({
  original,
  proposed,
  onAccept,
  onReject,
  onClose,
  invalidMessage,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])

  useEffect(() => {
    if (!host.current) return
    const ext = [
      lineNumbers(),
      mermaid(),
      editorTheme,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
    ]
    const view = new MergeView({
      a: { doc: original, extensions: ext },
      b: { doc: proposed, extensions: ext },
      parent: host.current,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
    })
    return () => view.destroy()
  }, [original, proposed])

  return (
    <dialog
      ref={dialog}
      className="diff-dialog"
      onClose={onClose}
      aria-labelledby="diff-title"
      data-testid="diff-dialog"
    >
      <div className="diff-header">
        <h2 id="diff-title">Review proposed change</h2>
        <div className="diff-legend">
          <span>Current</span>
          <span>Proposed</span>
        </div>
      </div>
      {invalidMessage && (
        <div className="ai-error" role="alert">
          The proposal does not parse: {invalidMessage}. You can still apply it and fix it by hand.
        </div>
      )}
      <div className="diff-body" ref={host} />
      <div className="dialog-actions">
        <button onClick={onClose}>Close</button>
        <button onClick={onReject} data-testid="diff-reject">
          Reject
        </button>
        <button className="primary" onClick={onAccept} data-testid="diff-accept">
          Accept
        </button>
      </div>
    </dialog>
  )
}
