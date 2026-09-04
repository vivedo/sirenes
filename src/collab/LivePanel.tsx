import { useEffect, useRef } from 'react'
import { useCollabStore } from './collabStore'
import { copyText } from '../shared/download'
import { toast } from '../store/toastStore'
import { liveLink } from './liveLink'
import { Icon } from '../shared/Icon'

/** Non-modal panel for starting, managing and leaving a live session. */
export function LivePanel() {
  const {
    panelOpen,
    session,
    role,
    status,
    sessionId,
    title,
    canEdit,
    aiEnabled,
    participants,
    error,
    myName,
    hostName,
  } = useCollabStore()
  const setPanelOpen = useCollabStore((s) => s.setPanelOpen)
  const startHosting = useCollabStore((s) => s.startHosting)
  const leave = useCollabStore((s) => s.leave)
  const setTitle = useCollabStore((s) => s.setTitle)
  const setCanEdit = useCollabStore((s) => s.setCanEdit)
  const setAiEnabled = useCollabStore((s) => s.setAiEnabled)
  const setMyName = useCollabStore((s) => s.setMyName)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanelOpen(false)
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      // The toolbar strip toggles the panel itself; do not close-then-reopen on its click.
      if (target.closest?.('.live-strip')) return
      if (root.current && !root.current.contains(target)) setPanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [panelOpen, setPanelOpen])

  if (!panelOpen) return null

  const copy = async () => {
    if (!sessionId) return
    toast.info((await copyText(liveLink(sessionId))) ? 'Live link copied' : 'Clipboard unavailable')
  }

  return (
    <div
      className="live-panel"
      ref={root}
      role="dialog"
      aria-label="Live collaboration"
      data-testid="live-panel"
    >
      <div className="live-head">
        <span>
          <Icon name="users" /> Live collaboration
        </span>
        <button onClick={() => setPanelOpen(false)} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>

      <label className="save-field">
        <span>Your name</span>
        <input
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          placeholder="Shown to others"
          data-testid="live-name"
        />
      </label>

      {!session ? (
        <>
          <p className="ai-muted live-hint">
            Others edit this diagram with you, directly between browsers. They see the diagram and
            your cursors, nothing else: not your files, Drive, or AI assistant.
          </p>
          <div className="dialog-actions">
            <button
              className="primary"
              onClick={() => void startHosting()}
              disabled={status === 'connecting'}
              data-testid="live-start"
            >
              {status === 'connecting' ? 'Starting…' : 'Start sharing'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={`live-status live-${status}`} data-testid="live-status">
            <span className="live-dot" />
            {status === 'connected' &&
              (role === 'host' ? 'Sharing' : `Connected to ${hostName ?? 'host'}`)}
            {status === 'connecting' && 'Connecting…'}
            {status === 'reconnecting' && 'Reconnecting…'}
          </div>

          {role === 'host' && (
            <>
              <label className="save-field">
                <span>Session title (what guests see)</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="live-title"
                />
              </label>
              <div className="live-link">
                <code data-testid="live-link">{sessionId ? liveLink(sessionId) : ''}</code>
                <button className="outline" onClick={() => void copy()} data-testid="live-copy">
                  <Icon name="link" /> Copy link
                </button>
              </div>
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={canEdit}
                  onChange={(e) => setCanEdit(e.target.checked)}
                  data-testid="live-can-edit"
                />
                Guests can edit
              </label>
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  data-testid="live-ai-enabled"
                />
                Guests can use my AI assistant
              </label>
            </>
          )}

          <div className="live-participants" data-testid="live-participants">
            {participants.map((p) => (
              <span key={p.clientId} className="live-chip" style={{ borderColor: p.color }}>
                <span className="live-swatch" style={{ background: p.color }} />
                {p.name}
                {p.isHost && <span className="ai-muted"> (host)</span>}
                {p.isSelf && <span className="ai-muted"> (you)</span>}
              </span>
            ))}
          </div>

          {error && (
            <div className="ai-error" role="alert">
              {error}
            </div>
          )}

          <div className="dialog-actions">
            <button
              className={role === 'host' ? 'danger' : ''}
              onClick={leave}
              data-testid="live-leave"
            >
              {role === 'host' ? 'End session' : 'Leave session'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
