import { useState } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { CONVERT_TARGETS, PRESETS, type PromptMode } from './prompt'
import { Menu, MenuItem } from '../app/Menu'
import { useOnlineStore } from '../shared/onlineStore'

interface Props {
  streaming: boolean
  /** False with a reason when sending is not possible right now. */
  disabledReason?: string | null
  onSend: (text: string, mode: PromptMode) => void
  onCancel: () => void
}

export function Composer({ streaming, disabledReason, onSend, onCancel }: Props) {
  const [draft, setDraft] = useState('')
  const hasError = useDocumentStore((s) => s.render.error !== null)
  const empty = useDocumentStore((s) => s.doc.source.trim() === '')
  const online = useOnlineStore((s) => s.online)
  const blocked = !online
    ? 'Offline: the AI assistant needs a connection'
    : (disabledReason ?? null)

  const submit = () => {
    if (!draft.trim() || streaming || blocked) return
    onSend(draft.trim(), 'edit')
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
            disabled={streaming || Boolean(blocked) || (empty && p.id !== 'fix')}
            onClick={() => onSend(p.request({ hasError }), p.mode)}
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
                disabled={streaming || Boolean(blocked) || empty}
                onClick={() => {
                  onSend(
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
          blocked
            ? blocked
            : empty
              ? 'Describe the diagram you want…'
              : 'Describe a change to this diagram…'
        }
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        disabled={streaming || Boolean(blocked)}
        data-testid="ai-input"
      />
      <div className="ai-composer-actions">
        <span className="ai-muted">{blocked ?? '⌘/Ctrl + Enter to send'}</span>
        {streaming ? (
          <button className="outline" onClick={onCancel} data-testid="ai-cancel">
            Cancel
          </button>
        ) : (
          <button
            className="primary"
            onClick={submit}
            disabled={!draft.trim() || Boolean(blocked)}
            data-testid="ai-send"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
