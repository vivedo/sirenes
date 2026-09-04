import { useState } from 'react'
import { useAiStore } from './aiStore'
import { useAiSettingsStore } from './aiSettingsStore'
import { maskKey, type KeyStorageMode } from './keyStorage'

export function KeySettings({ onDone }: { onDone?: () => void }) {
  const apiKey = useAiStore((s) => s.apiKey)
  const keyStatus = useAiStore((s) => s.keyStatus)
  const keyInfo = useAiStore((s) => s.keyInfo)
  const keyError = useAiStore((s) => s.keyError)
  const setKey = useAiStore((s) => s.setKey)
  const removeKey = useAiStore((s) => s.removeKey)
  const storedMode = useAiSettingsStore((s) => s.keyStorageMode)

  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<KeyStorageMode>(storedMode)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await setKey(draft, mode)
    if (useAiStore.getState().keyStatus === 'valid') {
      setDraft('')
      onDone?.()
    }
  }

  return (
    <div className="ai-settings" data-testid="ai-key-settings">
      {apiKey && keyStatus !== 'invalid' ? (
        <div className="ai-key-current">
          <div>
            <strong>{keyInfo?.label ?? 'OpenRouter key'}</strong>
            <div className="ai-muted">
              <code>{maskKey(apiKey)}</code> · stored{' '}
              {storedMode === 'local' ? 'on this device' : 'for this session'}
            </div>
            {keyInfo && (
              <div className="ai-muted">
                Used ${keyInfo.usage.toFixed(2)}
                {keyInfo.limit !== null ? ` of $${keyInfo.limit.toFixed(2)}` : ''}
                {keyInfo.isFreeTier ? ' · free tier' : ''}
              </div>
            )}
          </div>
          <button className="outline" onClick={removeKey} data-testid="ai-remove-key">
            Remove key
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="ai-key-form">
          <p>
            Paste an{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              OpenRouter API key
            </a>
            . It is sent only to openrouter.ai and stored only in this browser.
          </p>
          <label className="ai-field">
            <span>API key</span>
            <div className="ai-key-input">
              <input
                type={show ? 'text' : 'password'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="sk-or-v1-…"
                autoComplete="off"
                spellCheck={false}
                required
                data-testid="ai-key-input"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide key' : 'Show key'}
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <fieldset className="ai-radio-group">
            <legend className="visually-hidden">Where to store the key</legend>
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === 'local'}
                onChange={() => setMode('local')}
              />
              Remember on this device
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === 'session'}
                onChange={() => setMode('session')}
              />
              This session only
            </label>
          </fieldset>
          {keyError && (
            <div className="ai-error" role="alert">
              {keyError}
            </div>
          )}
          <div className="dialog-actions">
            <button
              type="submit"
              className="primary"
              disabled={keyStatus === 'checking' || !draft.trim()}
              data-testid="ai-save-key"
            >
              {keyStatus === 'checking' ? 'Checking…' : 'Save key'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
