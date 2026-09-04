import { useCallback, useEffect, useRef, useState } from 'react'
import { useAiStore } from './aiStore'
import { useAiSettingsStore } from './aiSettingsStore'
import { useSettingsStore } from '../store/settingsStore'
import { useDocumentStore } from '../store/documentStore'
import { KeySettings } from './KeySettings'
import { ModelSelector } from './ModelSelector'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { DiffDialog } from './DiffDialog'
import { applySourceEdit } from '../editor/applySourceEdit'
import { Icon } from '../shared/Icon'
import { useCollabStore } from '../collab/collabStore'
import { sharedAi } from '../collab/aiBridge'
import type { AiMessage } from './types'
import './ai.css'

export function AiPanel() {
  const toggle = useSettingsStore((s) => s.toggleAiPanel)
  const width = useSettingsStore((s) => s.aiPanelWidth)
  const setWidth = useSettingsStore((s) => s.setAiPanelWidth)
  const panel = useRef<HTMLElement>(null)
  const keyStatus = useAiStore((s) => s.keyStatus)
  const apiKey = useAiStore((s) => s.apiKey)
  const docId = useDocumentStore((s) => s.doc.id)
  const source = useDocumentStore((s) => s.doc.source)
  const loadConversation = useAiStore((s) => s.loadConversation)
  const clearConversation = useAiStore((s) => s.clearConversation)
  const messages = useAiStore((s) => s.messages)
  const streaming = useAiStore((s) => s.streaming)
  const send = useAiStore((s) => s.send)
  const cancel = useAiStore((s) => s.cancel)
  const remote = useAiStore((s) => s.remote)
  const reviewId = useAiStore((s) => s.reviewMessageId)
  const openReview = useAiStore((s) => s.openReview)
  const applyProposal = useAiStore((s) => s.applyProposal)
  const rejectProposal = useAiStore((s) => s.rejectProposal)
  const pin = useAiSettingsStore((s) => s.pinConversation)
  const setPin = useAiSettingsStore((s) => s.setPinConversation)
  const [showSettings, setShowSettings] = useState(false)

  const collabRole = useCollabStore((s) => (s.session ? s.role : null))
  const collabCanEdit = useCollabStore((s) => s.canEdit)
  const hostName = useCollabStore((s) => s.hostName)
  const myName = useCollabStore((s) => s.myName)

  useEffect(() => {
    if (collabRole !== 'guest') void loadConversation(docId)
  }, [docId, loadConversation, collabRole])

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = panel.current
      if (!el) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      const startX = e.clientX
      const startWidth = el.getBoundingClientRect().width
      const move = (ev: PointerEvent) => setWidth(startWidth + (startX - ev.clientX))
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        el.classList.remove('resizing')
      }
      el.classList.add('resizing')
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [setWidth],
  )
  const onResizeKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setWidth(width + 16)
    if (e.key === 'ArrowRight') setWidth(width - 16)
  }

  const hasKey = apiKey !== null && keyStatus !== 'invalid'
  const isGuest = collabRole === 'guest' && remote !== null
  const shownMessages: AiMessage[] = isGuest ? (remote!.messages as AiMessage[]) : messages
  const shownStreaming = isGuest ? remote!.streaming : streaming
  const review = reviewId ? shownMessages.find((m) => m.id === reviewId) : undefined

  const actions = isGuest
    ? {
        canApply: collabCanEdit,
        onReview: (id: string) => openReview(id),
        onAccept: (id: string) => {
          sharedAi.apply(id)
          openReview(null)
        },
        onReject: (id: string) => {
          sharedAi.reject(id)
          openReview(null)
        },
      }
    : {
        canApply: true,
        onReview: (id: string) => openReview(id),
        onAccept: (id: string) =>
          applyProposal(
            id,
            applySourceEdit,
            collabRole === 'host' ? myName.trim() || 'Host' : undefined,
          ),
        onReject: (id: string) => rejectProposal(id),
      }

  const guestBlocked = !isGuest
    ? null
    : !remote!.enabled
      ? `${hostName ?? 'The host'} has turned the shared assistant off`
      : !remote!.hasKey
        ? `${hostName ?? 'The host'} has not set up an AI key`
        : null

  return (
    <aside
      className="ai-panel"
      aria-label="AI assistant"
      data-testid="ai-panel"
      ref={panel}
      style={{ width }}
    >
      <div
        className="ai-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize AI panel"
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={onResizeKey}
        onDoubleClick={() => setWidth(360)}
        title="Drag to resize, double-click to reset"
        data-testid="ai-panel-resizer"
      />
      <div className="ai-panel-header">
        <span>
          <Icon name="sparkle" /> {isGuest ? 'Shared assistant' : 'AI assistant'}
        </span>
        <div className="ai-panel-header-actions">
          {!isGuest && hasKey && messages.length > 0 && (
            <button
              onClick={clearConversation}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <Icon name="file" />
            </button>
          )}
          {!isGuest && hasKey && (
            <button
              onClick={() => setShowSettings((v) => !v)}
              aria-pressed={showSettings}
              title="AI settings"
              aria-label="AI settings"
              data-testid="ai-settings-toggle"
            >
              <Icon name="help" />
            </button>
          )}
          <button onClick={() => toggle(false)} aria-label="Close AI panel">
            <Icon name="close" />
          </button>
        </div>
      </div>

      {isGuest ? (
        <>
          <div className="ai-toolbar ai-shared-note" data-testid="ai-shared-note">
            <Icon name="users" size={14} /> Runs on {hostName ?? 'the host'}'s key
            {remote!.model ? ` · ${remote!.model}` : ''}. Everyone in the session sees this chat.
          </div>
          <MessageList
            messages={shownMessages}
            streaming={shownStreaming}
            actions={actions}
            showAuthors
            emptyHint="Ask the shared assistant for a change. The host runs it and everyone sees the answer."
          />
          <Composer
            streaming={shownStreaming}
            disabledReason={guestBlocked}
            onSend={(text, mode) => sharedAi.send(text, mode)}
            onCancel={() => sharedAi.cancel()}
          />
        </>
      ) : !hasKey ? (
        <div className="ai-panel-body">
          <KeySettings />
        </div>
      ) : showSettings ? (
        <div className="ai-panel-body">
          <KeySettings onDone={() => setShowSettings(false)} />
          <label className="ai-check">
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
            Keep the conversation when starting a new document
          </label>
          <div className="dialog-actions">
            <button onClick={() => setShowSettings(false)}>Back to chat</button>
          </div>
        </div>
      ) : (
        <>
          <div className="ai-toolbar">
            <ModelSelector />
            {collabRole === 'host' && (
              <div className="ai-shared-note ai-muted" data-testid="ai-host-note">
                <Icon name="users" size={12} /> Shared with your guests
              </div>
            )}
          </div>
          <MessageList
            messages={shownMessages}
            streaming={shownStreaming}
            actions={actions}
            showAuthors={collabRole === 'host'}
          />
          <Composer
            streaming={shownStreaming}
            onSend={(text, mode) =>
              void send(text, mode, collabRole === 'host' ? myName.trim() || 'Host' : undefined)
            }
            onCancel={cancel}
          />
        </>
      )}

      {review?.proposal && (
        <DiffDialog
          original={source}
          proposed={review.proposal.code}
          invalidMessage={review.proposal.error?.message ?? null}
          onAccept={() => actions.onAccept(review.id)}
          onReject={() => actions.onReject(review.id)}
          onClose={() => openReview(null)}
        />
      )}
    </aside>
  )
}
