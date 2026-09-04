import { useDocumentStore } from '../store/documentStore'
import { useCollabStore } from '../collab/collabStore'
import { toast } from '../store/toastStore'
import { defaultDiagramName, type Diagram } from './multi'
import { applySourceEdit } from '../editor/applySourceEdit'

/**
 * Diagram-level actions. Outside a live session they edit the store directly; inside one they
 * edit the shared document and the store follows through the session's observer.
 */
function session() {
  const c = useCollabStore.getState()
  return c.session
}

export function canEditDiagrams(): boolean {
  const s = session()
  return !s || s.role === 'host' || s.canEdit
}

export function addDiagram(source = ''): void {
  const s = session()
  if (s) {
    const id = s.addDiagram(source, defaultDiagramName(s.diagrams().length))
    if (id) switchToDiagramId(id)
    return
  }
  useDocumentStore.getState().addDiagram(source)
}

export function renameDiagram(index: number, name: string): void {
  const s = session()
  const d = useDocumentStore.getState().doc.diagrams[index]
  if (!d) return
  if (s)
    return s.renameDiagram(
      d.id,
      name.replace(/\r?\n/g, ' ').trim() || d.name || defaultDiagramName(index),
    )
  useDocumentStore.getState().renameDiagram(index, name)
}

export function removeDiagram(index: number): void {
  const s = session()
  const d = useDocumentStore.getState().doc.diagrams[index]
  if (!d) return
  const removed: Diagram | null = s
    ? s.removeDiagram(d.id)
    : useDocumentStore.getState().removeDiagram(index)
  if (!removed) return
  toast.action(`Removed ${removed.name ?? defaultDiagramName(index)}`, 'Undo', () => {
    const live = session()
    if (live) live.insertDiagram(index, removed)
    else useDocumentStore.getState().insertDiagram(index, removed)
  })
}

export function switchDiagram(index: number): void {
  useDocumentStore.getState().switchDiagram(index)
}

export function switchToDiagramId(id: string): void {
  const { doc } = useDocumentStore.getState()
  const index = doc.diagrams.findIndex((d) => d.id === id)
  if (index !== -1) useDocumentStore.getState().switchDiagram(index)
}

/**
 * Replace the source of a diagram by id (AI proposals). The active diagram goes through the
 * editor so it is one undo step; other diagrams are updated directly.
 */
export function applyToDiagram(diagramId: string, code: string): void {
  const store = useDocumentStore.getState()
  const s = session()
  if (s) {
    s.replaceText(diagramId, code)
    return
  }
  const index = store.doc.diagrams.findIndex((d) => d.id === diagramId)
  if (index === -1) return
  if (index === store.doc.active) applySourceEdit(code)
  else {
    // Update the inactive diagram in place.
    const active = store.doc.active
    store.switchDiagram(index)
    store.setSource(code)
    store.switchDiagram(active)
  }
}
