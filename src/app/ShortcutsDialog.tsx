import { useEffect, useRef } from 'react'
import { SHORTCUTS } from './shortcuts'

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td>
                {s.keys.map((k, i) => (
                  <kbd key={i}>{k}</kbd>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dialog-actions">
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}
