import { useDocumentStore } from '../store/documentStore'
import { MERMAID_VERSION } from '../preview/renderer'
import { Icon } from '../shared/Icon'
import { useOnlineStore } from '../shared/onlineStore'

export function StatusBar({ onShowPrivacy }: { onShowPrivacy: () => void }) {
  const error = useDocumentStore((s) => s.render.error)
  const rendering = useDocumentStore((s) => s.render.rendering)
  const urlStatus = useDocumentStore((s) => s.urlStatus)
  const fallback = useDocumentStore((s) => s.render.fallback)
  const engine = useDocumentStore((s) => s.render.engine)
  const source = useDocumentStore((s) => s.doc.source)
  const lines = source === '' ? 0 : source.split('\n').length
  const online = useOnlineStore((s) => s.online)

  return (
    <footer className="statusbar" role="contentinfo">
      <span className={`status-render ${error ? 'error' : 'ok'}`} data-testid="status-render">
        {error ? (
          <>
            <Icon name="close" size={12} /> {error.line ? `Line ${error.line}: ` : ''}
            {error.message}
          </>
        ) : rendering ? (
          'Rendering…'
        ) : (
          <>
            <Icon name="check" size={12} /> No errors
          </>
        )}
      </span>
      {fallback && !error && (
        <span className="status-warn" title={fallback} data-testid="status-fallback">
          Mermaid fallback
        </span>
      )}
      <span className="status-spacer" />
      {!online && (
        <span
          className="status-warn"
          data-testid="status-offline"
          title="Drive and AI need a connection. Editing, sharing and local files keep working."
        >
          Offline
        </span>
      )}
      {urlStatus === 'long' && (
        <span className="status-warn" data-testid="status-url">
          Long share link
        </span>
      )}
      {urlStatus === 'too-long' && (
        <span className="status-error" data-testid="status-url">
          Diagram too large for a share link
        </span>
      )}
      <button className="status-link" onClick={onShowPrivacy} data-testid="privacy-link">
        Privacy
      </button>
      <span className="status-muted">{lines} lines</span>
      <span className="status-muted" data-testid="status-engine">
        {engine === 'beautiful' ? 'beautiful-mermaid' : `Mermaid ${MERMAID_VERSION}`}
      </span>
    </footer>
  )
}
