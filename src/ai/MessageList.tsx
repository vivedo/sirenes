import { useEffect, useRef } from 'react'
import { useAiStore } from './aiStore'
import { stripMermaidBlocks } from './proposal'
import { formatUsage } from './format'
import { applySourceEdit } from '../editor/applySourceEdit'
import type { AiMessage } from './types'
import { toast } from '../store/toastStore'

export function MessageList() {
  const messages = useAiStore((s) => s.messages)
  const streaming = useAiStore((s) => s.streaming)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  if (messages.length === 0) {
    return (
      <div className="ai-empty ai-muted">
        Ask for a change (“add a retry loop after the API call”), describe a diagram to create, or
        use a preset below. Proposals show as a diff you can accept or reject.
      </div>
    )
  }

  return (
    <div className="ai-messages" data-testid="ai-messages">
      {messages.map((m) => (
        <MessageItem key={m.id} message={m} />
      ))}
      <div ref={bottom} />
    </div>
  )
}

function MessageItem({ message: m }: { message: AiMessage }) {
  const streaming = useAiStore((s) => s.streaming)
  const isLast = useAiStore((s) => s.messages[s.messages.length - 1]?.id === m.id)
  const applyProposal = useAiStore((s) => s.applyProposal)
  const rejectProposal = useAiStore((s) => s.rejectProposal)
  const openReview = useAiStore((s) => s.openReview)

  const busy = streaming && isLast && m.role === 'assistant'
  const text = m.role === 'assistant' && m.proposal ? stripMermaidBlocks(m.content) : m.content

  return (
    <div className={`ai-msg ai-msg-${m.role}`} data-testid={`ai-msg-${m.role}`}>
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
              <span className="ai-ok">Applied</span>
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
            {m.proposal.code.split('\n').slice(0, 8).join('\n')}
            {m.proposal.code.split('\n').length > 8 ? '\n…' : ''}
          </pre>
          {!m.proposal.applied && (
            <div className="ai-proposal-actions">
              <button onClick={() => openReview(m.id)} data-testid="ai-review">
                Review diff
              </button>
              <button onClick={() => rejectProposal(m.id)} data-testid="ai-reject">
                Reject
              </button>
              <button
                className="primary"
                onClick={() => {
                  applyProposal(m.id, applySourceEdit)
                  toast.info('Applied. Undo with ⌘/Ctrl+Z.')
                }}
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
