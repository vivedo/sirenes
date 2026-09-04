import { useState } from 'react'
import { useAiStore } from './aiStore'
import { useDocumentStore } from '../store/documentStore'
import { CONVERT_TARGETS, PRESETS } from './prompt'
import { Menu, MenuItem } from '../app/Menu'
import { useOnlineStore } from '../shared/onlineStore'

export function Composer() {
  const [draft, setDraft] = useState('')
  const streaming = useAiStore((s) => s.streaming)
  const send = useAiStore((s) => s.send)
  const cancel = useAiStore((s) => s.cancel)
  const hasError = useDocumentStore((s) => s.render.error !== null)
  const empty = useDocumentStore((s) => s.doc.source.trim() === '')
  const online = useOnlineStore((s) => s.online)

  const submit = () => {
    if (!draft.trim() || streaming || !online) return
    void send(draft, 'edit')
    setDraft('')
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="ai-composer">
      <div className="ai-presets" role="toolbar" aria-label="Presets">
        {PRESETS.filter((p) => p.id !== 'convert').map((p) => (
          <button
            key={p.id}
            className="outline ai-preset"
            disabled={streaming || !online || (empty && p.id !== 'fix')}
            onClick={() => void send(p.request({ hasError }), p.mode)}
            data-testid={`preset-${p.id}`}
          >
            {p.label}
          </button>
        ))}
        <Menu label="Convert to" align="right">
          {(close) =>
            CONVERT_TARGETS.map((t) => (
              <MenuItem
                key={t}
                disabled={streaming || empty}
                onClick={() => {
                  void send(
                    PRESETS.find((p) => p.id === 'convert')!.request({ hasError, arg: t }),
                    'edit',
                  )
                  close()
                }}
              >
                {t}
              </MenuItem>
            ))
          }
        </Menu>
      </div>
      <textarea
        className="ai-input"
        rows={3}
        placeholder={
          empty ? 'Describe the diagram you want…' : 'Describe a change to this diagram…'
        }
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        disabled={streaming}
        data-testid="ai-input"
      />
      <div className="ai-composer-actions">
        <span className="ai-muted">
          {online ? '⌘/Ctrl + Enter to send' : 'Offline: the AI assistant needs a connection'}
        </span>
        {streaming ? (
          <button className="outline" onClick={cancel} data-testid="ai-cancel">
            Cancel
          </button>
        ) : (
          <button
            className="primary"
            onClick={submit}
            disabled={!draft.trim()}
            data-testid="ai-send"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
