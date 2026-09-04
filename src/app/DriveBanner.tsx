import { useDriveStore } from '../storage/drive'
import { openDriveFile } from '../documents/actions'
import { Icon } from '../shared/Icon'

/** Shown when the page was opened from a Drive link: sign-in needs a user gesture. */
export function DriveBanner() {
  const pendingId = useDriveStore((s) => s.pendingOpenId)
  const setPending = useDriveStore((s) => s.setPendingOpenId)
  if (!pendingId) return null
  return (
    <div className="banner" role="status" data-testid="drive-banner">
      <Icon name="cloud" />
      <span>This link points to a diagram on Google Drive.</span>
      <button
        className="primary"
        onClick={() => {
          setPending(null)
          void openDriveFile(pendingId)
        }}
        data-testid="drive-banner-open"
      >
        Open from Drive
      </button>
      <button onClick={() => setPending(null)} aria-label="Dismiss">
        <Icon name="close" />
      </button>
    </div>
  )
}
