import { useEffect, useRef } from 'react'
import { stripMermaidBlocks } from './proposal'
import { formatUsage } from './format'
import type { AiMessage } from './types'

export interface MessageActions {
  /** Whether Accept is available (guests need edit permission). */
  canApply: boolean
  onReview: (messageId: string) => void
  onAccept: (messageId: string) => void
  onReject: (messageId: string) => void
}

interface Props {
  messages: AiMessage[]
  streaming: boolean
  actions: MessageActions
  /** Show author names on user messages (live sessions). */
  showAuthors?: boolean
  emptyHint?: string
}

export function MessageList({ messages, streaming, actions, showAuthors, emptyHint }: Props) {
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  if (messages.length === 0) {
    return (
      <div className="ai-empty ai-muted">
        {emptyHint ??
          'Ask for a change (“add a retry loop after the API call”), describe a diagram to create, or use a preset below. Proposals show as a diff you can accept or reject.'}
      </div>
    )
  }

  const lastId = messages[messages.length - 1]?.id
  return (
    <div className="ai-messages" data-testid="ai-messages">
      {messages.map((m) => (
        <MessageItem
          key={m.id}
          message={m}
          busy={streaming && m.id === lastId && m.role === 'assistant'}
          actions={actions}
          showAuthor={Boolean(showAuthors)}
        />
      ))}
      <div ref={bottom} />
    </div>
  )
}

function MessageItem({
  message: m,
  busy,
  actions,
  showAuthor,
}: {
  message: AiMessage
  busy: boolean
  actions: MessageActions
  showAuthor: boolean
}) {
  const text = m.role === 'assistant' && m.proposal ? stripMermaidBlocks(m.content) : m.content
  const lines = m.proposal?.code.split('\n') ?? []

  return (
    <div className={`ai-msg ai-msg-${m.role}`} data-testid={`ai-msg-${m.role}`}>
      {showAuthor && m.role === 'user' && (
        <div className="ai-msg-author ai-muted" data-testid="ai-msg-author">
          {m.author ?? 'Host'}
        </div>
      )}
      {(text || busy) && (
        <div className="ai-msg-body">
          {text}
          {busy && (
            <span className="ai-cursor" aria-label="Generating">
              ▍
            </span>
          )}
        </div>
      )}
      {m.error && (
        <div className="ai-error" role="alert">
          {m.error}
        </div>
      )}
      {m.proposal && !busy && (
        <div
          className={`ai-proposal${m.proposal.error ? ' invalid' : ''}`}
          data-testid="ai-proposal"
        >
          <div className="ai-proposal-head">
            {m.proposal.applied ? (
              <span className="ai-ok">Applied{m.appliedBy ? ` by ${m.appliedBy}` : ''}</span>
            ) : m.proposal.error ? (
              <span className="ai-warn">
                Proposal has a syntax error
                {m.proposal.error.line ? ` on line ${m.proposal.error.line}` : ''}
              </span>
            ) : (
              <span>Proposed diagram</span>
            )}
          </div>
          <pre className="ai-proposal-code">
            {lines.slice(0, 8).join('\n')}
            {lines.length > 8 ? '\n…' : ''}
          </pre>
          {!m.proposal.applied && (
            <div className="ai-proposal-actions">
              <button onClick={() => actions.onReview(m.id)} data-testid="ai-review">
                Review diff
              </button>
              <button onClick={() => actions.onReject(m.id)} data-testid="ai-reject">
                Reject
              </button>
              <button
                className="primary"
                onClick={() => actions.onAccept(m.id)}
                disabled={!actions.canApply}
                title={actions.canApply ? undefined : 'The host has made the diagram read-only'}
                data-testid="ai-accept"
              >
                Accept
              </button>
            </div>
          )}
        </div>
      )}
      {m.role === 'assistant' && !busy && (m.usage || m.model) && (
        <div className="ai-msg-meta ai-muted">
          {m.model && <span title="Model">{m.model}</span>}
          {m.usage && <span title="Usage">{formatUsage(m.usage)}</span>}
        </div>
      )}
    </div>
  )
}
