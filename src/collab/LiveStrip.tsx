import { useCollabStore } from './collabStore'
import { Icon } from '../shared/Icon'

/** Compact presence indicator in the toolbar while a session is active. */
export function LiveStrip() {
  const { session, status, participants, role, panelOpen } = useCollabStore()
  const setPanelOpen = useCollabStore((s) => s.setPanelOpen)
  if (!session) return null
  return (
    <button
      className={`live-strip live-${status}`}
      onClick={() => setPanelOpen(!panelOpen)}
      aria-pressed={panelOpen}
      aria-expanded={panelOpen}
      title="Live collaboration"
      data-testid="live-strip"
    >
      <span className="live-dot" />
      <Icon name="users" size={14} />
      {participants.slice(0, 5).map((p) => (
        <span
          key={p.clientId}
          className="live-swatch"
          style={{ background: p.color }}
          title={p.name}
        />
      ))}
      <span className="live-count">{participants.length}</span>
      {role === 'guest' && <span className="ai-muted">guest</span>}
    </button>
  )
}
