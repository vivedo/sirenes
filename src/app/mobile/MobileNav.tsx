import { useDocumentStore } from '../../store/documentStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useMobileStore } from './mobileStore'
import { Icon } from '../../shared/Icon'

/** Bottom bar on phones: switch between code and preview, open the assistant, see render state. */
export function MobileNav() {
  const pane = useMobileStore((s) => s.pane)
  const setPane = useMobileStore((s) => s.setPane)
  const aiOpen = useSettingsStore((s) => s.aiPanelOpen)
  const toggleAi = useSettingsStore((s) => s.toggleAiPanel)
  const error = useDocumentStore((s) => s.render.error)
  const rendering = useDocumentStore((s) => s.render.rendering)

  return (
    <nav className="mobile-nav" aria-label="Views" data-testid="mobile-nav">
      <div className="segmented mobile-nav-panes" role="radiogroup" aria-label="Pane">
        <button
          role="radio"
          aria-checked={pane === 'editor'}
          className={pane === 'editor' ? 'active' : ''}
          onClick={() => setPane('editor')}
          data-testid="mobile-pane-editor"
        >
          <Icon name="code" /> Code
          {error && <span className="mobile-error-dot" aria-hidden="true" />}
        </button>
        <button
          role="radio"
          aria-checked={pane === 'preview'}
          className={pane === 'preview' ? 'active' : ''}
          onClick={() => setPane('preview')}
          data-testid="mobile-pane-preview"
        >
          <Icon name="eye" /> Preview
        </button>
      </div>
      <span
        className={`mobile-status ${error ? 'error' : 'ok'}`}
        aria-live="polite"
        data-testid="status-render"
      >
        {error
          ? `Line ${error.line ?? '?'}: ${error.message}`
          : rendering
            ? 'Rendering…'
            : 'No errors'}
      </span>
      <button
        className={`mobile-ai${aiOpen ? ' active' : ''}`}
        onClick={() => toggleAi()}
        aria-pressed={aiOpen}
        data-testid="toggle-ai"
      >
        <Icon name="sparkle" /> AI
      </button>
    </nav>
  )
}
