import { useCollabStore } from './collabStore'
import { Icon } from '../shared/Icon'

/** Shown while joining from a #live: link, and when joining fails. */
export function JoinBanner() {
  const { role, status, error, sessionId } = useCollabStore()
  const join = useCollabStore((s) => s.join)
  const dismiss = () =>
    useCollabStore.setState({ status: null, error: null, role: null, sessionId: null })

  if (role === 'guest' && status === 'connecting') {
    return (
      <div className="banner" role="status" data-testid="join-banner">
        <Icon name="users" />
        <span>Connecting to the shared session…</span>
      </div>
    )
  }
  if (status === 'failed' && error) {
    return (
      <div className="banner" role="alert" data-testid="join-banner">
        <Icon name="users" />
        <span>
          Could not join the session: {error} Peer-to-peer connections sometimes fail behind strict
          firewalls; ask the host for a static share link instead.
        </span>
        {sessionId && (
          <button className="primary" onClick={() => void join(sessionId)} data-testid="join-retry">
            Try again
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss">
          <Icon name="close" />
        </button>
      </div>
    )
  }
  return null
}
