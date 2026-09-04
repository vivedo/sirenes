import { useToastStore } from '../store/toastStore'

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (!toasts.length) return null
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status">
          <span onClick={() => dismiss(t.id)}>{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action?.onClick()
                dismiss(t.id)
              }}
              data-testid="toast-action"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
