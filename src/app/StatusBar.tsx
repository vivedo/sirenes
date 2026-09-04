import { useDocumentStore } from '../store/documentStore'
import { MERMAID_VERSION } from '../preview/renderer'
import { Icon } from '../shared/Icon'

export function StatusBar() {
  const error = useDocumentStore((s) => s.render.error)
  const rendering = useDocumentStore((s) => s.render.rendering)
  const urlStatus = useDocumentStore((s) => s.urlStatus)
  const source = useDocumentStore((s) => s.doc.source)
  const lines = source === '' ? 0 : source.split('\n').length

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
      <span className="status-spacer" />
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
      <span className="status-muted">{lines} lines</span>
      <span className="status-muted">Mermaid {MERMAID_VERSION}</span>
    </footer>
  )
}
