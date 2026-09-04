import { useEffect, useRef } from 'react'
import { useDialogStore } from './dialogStore'

export function ChoiceDialog() {
  const current = useDialogStore((s) => s.current)
  const answer = useDialogStore((s) => s.answer)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (current && !d.open) d.showModal()
    if (!current && d.open) d.close()
  }, [current])

  if (!current) return null
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        answer(null)
      }}
      aria-labelledby="choice-title"
      data-testid="choice-dialog"
    >
      <h2 id="choice-title">{current.title}</h2>
      <p>{current.message}</p>
      <div className="dialog-actions">
        <button onClick={() => answer(null)}>Cancel</button>
        {current.options.map((o) => (
          <button
            key={o.id}
            className={o.primary ? 'primary' : o.danger ? 'danger' : ''}
            onClick={() => answer(o.id)}
            data-testid={`choice-${o.id}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </dialog>
  )
}
