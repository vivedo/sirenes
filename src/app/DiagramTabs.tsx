import { useEffect, useRef, useState } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useCollabStore } from '../collab/collabStore'
import { defaultDiagramName } from '../documents/multi'
import * as actions from '../documents/diagramActions'
import { Icon } from '../shared/Icon'
import './DiagramTabs.css'

/**
 * Tabs for the diagrams inside one document. Double-click a tab to rename it. Removing a
 * diagram is undoable from a toast. Disabled during a live session, which shares one diagram.
 */
export function DiagramTabs() {
  const diagrams = useDocumentStore((s) => s.doc.diagrams)
  const active = useDocumentStore((s) => s.doc.active)
  const markdown = useDocumentStore((s) => s.doc.markdown)
  const canEditShared = useCollabStore((s) => !s.session || s.role === 'host' || s.canEdit)
  const participants = useCollabStore((s) => s.participants)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing !== null) input.current?.select()
  }, [editing])

  const locked = markdown !== null || !canEditShared
  const lockReason =
    markdown !== null
      ? 'Markdown files hold one diagram'
      : !canEditShared
        ? 'The host has made this session read-only'
        : undefined

  const startRename = (i: number) => {
    if (locked) return
    // Read from the store: this also runs right after addDiagram, before the next render.
    const d = useDocumentStore.getState().doc.diagrams[i]
    if (!d) return
    setDraft(d.name ?? defaultDiagramName(i))
    setEditing(i)
  }
  const commitRename = () => {
    if (editing !== null) actions.renameDiagram(editing, draft)
    setEditing(null)
  }
  const remove = (i: number) => actions.removeDiagram(i)

  return (
    <div
      className="diagram-tabs"
      role="group"
      aria-label="Diagrams in this document"
      data-testid="diagram-tabs"
    >
      {diagrams.map((d, i) => {
        const name = d.name ?? defaultDiagramName(i)
        const isActive = i === active
        return (
          <div key={i} className={`diagram-tab${isActive ? ' active' : ''}`}>
            {editing === i ? (
              <input
                ref={input}
                className="diagram-tab-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditing(null)
                }}
                aria-label="Diagram name"
                data-testid="diagram-tab-input"
              />
            ) : (
              <button
                aria-pressed={isActive}
                aria-current={isActive ? 'true' : undefined}
                className="diagram-tab-button"
                onClick={() => (isActive ? startRename(i) : actions.switchDiagram(i))}
                onDoubleClick={() => startRename(i)}
                title={lockReason ?? (isActive ? 'Click to rename' : name)}
                data-testid={`diagram-tab-${i}`}
              >
                {name}
                {participants
                  .filter((p) => !p.isSelf && p.diagramId === d.id)
                  .slice(0, 3)
                  .map((p) => (
                    <span
                      key={p.clientId}
                      className="live-swatch diagram-tab-presence"
                      style={{ background: p.color }}
                      title={`${p.name} is here`}
                    />
                  ))}
              </button>
            )}
            {diagrams.length > 1 && !locked && editing !== i && (
              <button
                className="diagram-tab-close"
                onClick={() => remove(i)}
                aria-label={`Remove ${name}`}
                title="Remove diagram"
                data-testid={`diagram-tab-close-${i}`}
              >
                <Icon name="close" size={11} />
              </button>
            )}
          </div>
        )
      })}
      <button
        className="diagram-tab-add"
        onClick={() => {
          actions.addDiagram('')
          setTimeout(() => startRename(useDocumentStore.getState().doc.active), 0)
        }}
        disabled={locked}
        title={lockReason ?? 'Add a diagram to this file'}
        aria-label="Add diagram"
        data-testid="diagram-tab-add"
      >
        <Icon name="plus" size={13} />
      </button>
    </div>
  )
}
