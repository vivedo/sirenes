import { useEffect, useRef } from 'react'
import { useDocumentStore } from '../store/documentStore'

/** Shown when the shared link and the local autosave hold different diagrams. */
export function ConflictDialog() {
  const pending = useDocumentStore((s) => s.pendingAutosave)
  const resolve = useDocumentStore((s) => s.resolveConflict)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (pending && !d.open) d.showModal()
    if (!pending && d.open) d.close()
  }, [pending])

  if (!pending) return null
  const preview = pending.source.split('\n').slice(0, 6).join('\n')

  return (
    <dialog
      ref={ref}
      onCancel={(e) => e.preventDefault()}
      aria-labelledby="conflict-title"
      data-testid="conflict-dialog"
    >
      <h2 id="conflict-title">Restore your unsaved work?</h2>
      <p>
        This link contains a diagram, but you also have unsaved work from a previous session
        {pending.fileName ? ` (${pending.fileName})` : ''}. Which one do you want to keep?
      </p>
      <pre className="conflict-preview">{preview}</pre>
      <div className="dialog-actions">
        <button onClick={() => resolve('url')} data-testid="conflict-keep-url">
          Use the link
        </button>
        <button
          className="primary"
          onClick={() => resolve('autosave')}
          data-testid="conflict-keep-autosave"
        >
          Restore unsaved work
        </button>
      </div>
    </dialog>
  )
}
