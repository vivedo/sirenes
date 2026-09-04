import { useSettingsStore } from '../store/settingsStore'
import { Icon } from '../shared/Icon'

/** Placeholder until Phase 3 wires OpenRouter in. */
export function AiPanel() {
  const toggle = useSettingsStore((s) => s.toggleAiPanel)
  return (
    <aside className="ai-panel" aria-label="AI assistant" data-testid="ai-panel">
      <div className="ai-panel-header">
        <span>
          <Icon name="sparkle" /> AI assistant
        </span>
        <button onClick={() => toggle(false)} aria-label="Close AI panel">
          <Icon name="close" />
        </button>
      </div>
      <div className="ai-panel-body">
        <p>
          Coming in the next phase: bring your own OpenRouter key and edit this diagram with natural
          language.
        </p>
      </div>
    </aside>
  )
}
