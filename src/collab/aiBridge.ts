import { useAiStore, DEFAULT_MODEL_ID } from '../ai/aiStore'
import { useAiSettingsStore } from '../ai/aiSettingsStore'
import { threadKey } from '../ai/history'
import { useDocumentStore } from '../store/documentStore'
import { applyToDiagram } from '../documents/diagramActions'
import { useCollabStore } from './collabStore'
import type { AiRequest, CollabSession, SharedAiState } from './session'
import type { AiMessage } from '../ai/types'
import { newId } from '../shared/id'

const PUBLISH_THROTTLE_MS = 80

/**
 * Connects a session to the AI store.
 *  - Host: publishes its assistant state (one thread per diagram, model, key presence) to guests
 *    and executes guest requests with its own key, so everyone shares one conversation per diagram.
 *  - Guest: mirrors the host's state into `useAiStore().remote`.
 * Returns a teardown function.
 */
export function attachAiBridge(session: CollabSession): () => void {
  return session.role === 'host' ? attachHost(session) : attachGuest(session)
}

function snapshot(): SharedAiState {
  const ai = useAiStore.getState()
  const { doc } = useDocumentStore.getState()
  const threads: SharedAiState['threads'] = {}
  for (const d of doc.diagrams) {
    const t = ai.threads[threadKey(doc.id, d.id)]
    if (t) threads[d.id] = { messages: t.messages as unknown[], streaming: t.streaming }
  }
  return {
    enabled: useCollabStore.getState().aiEnabled,
    hasKey: ai.apiKey !== null && ai.keyStatus !== 'invalid',
    model: useAiSettingsStore.getState().selectedModelId ?? DEFAULT_MODEL_ID,
    threads,
  }
}

function attachHost(session: CollabSession): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const publish = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      session.publishAiState(snapshot())
    }, PUBLISH_THROTTLE_MS)
  }
  const keyFor = (diagramId: string) => threadKey(useDocumentStore.getState().doc.id, diagramId)

  const unsubs = [
    useAiStore.subscribe((s, prev) => {
      if (s.threads !== prev.threads || s.apiKey !== prev.apiKey || s.keyStatus !== prev.keyStatus)
        publish()
    }),
    useDocumentStore.subscribe((s, prev) => {
      if (s.doc.diagrams !== prev.doc.diagrams) publish()
    }),
    useAiSettingsStore.subscribe((s, prev) => {
      if (s.selectedModelId !== prev.selectedModelId) publish()
    }),
    useCollabStore.subscribe((s, prev) => {
      if (s.aiEnabled !== prev.aiEnabled) publish()
    }),
    session.aiRequested.on((req: AiRequest) => {
      const { doc } = useDocumentStore.getState()
      const diagram = doc.diagrams.find((d) => d.id === req.diagramId)
      if (!diagram) return
      void useAiStore.getState().send(req.text, req.mode, {
        key: keyFor(diagram.id),
        source: session.textFor(diagram.id)?.toString() ?? diagram.source,
        author: req.author,
      })
    }),
    session.aiCancelRequested.on(({ diagramId }) =>
      useAiStore.getState().cancel(keyFor(diagramId)),
    ),
    session.aiApplyRequested.on(({ messageId, author, diagramId }) =>
      useAiStore
        .getState()
        .applyProposal(
          messageId,
          (code) => applyToDiagram(diagramId, code),
          author,
          keyFor(diagramId),
        ),
    ),
    session.aiRejectRequested.on(({ messageId, diagramId }) =>
      useAiStore.getState().rejectProposal(messageId, keyFor(diagramId)),
    ),
  ]
  session.publishAiState(snapshot())

  return () => {
    for (const u of unsubs) u()
    if (timer) clearTimeout(timer)
  }
}

function attachGuest(session: CollabSession): () => void {
  const ai = useAiStore.getState()
  ai.setRemote(
    session.aiState ?? { enabled: session.aiEnabled, hasKey: false, model: null, threads: {} },
  )
  const unsubs = [
    session.aiStateChanged.on((state) => useAiStore.getState().setRemote(state)),
    session.aiPermissionChanged.on((enabled) => {
      const cur = useAiStore.getState().remote
      if (cur) useAiStore.getState().setRemote({ ...cur, enabled })
    }),
  ]
  return () => {
    for (const u of unsubs) u()
    useAiStore.getState().setRemote(null)
  }
}

function activeDiagramId(): string {
  const { doc } = useDocumentStore.getState()
  return doc.diagrams[doc.active]?.id ?? ''
}

/** Guest actions: forwarded to the host, who owns the conversation. */
export const sharedAi = {
  send(text: string, mode: 'edit' | 'explain' = 'edit') {
    const { session, myName } = useCollabStore.getState()
    if (!session || session.role !== 'guest') return
    session.sendAiRequest({
      id: newId(),
      text,
      mode,
      author: myName.trim() || 'Guest',
      diagramId: activeDiagramId(),
    })
  },
  cancel() {
    useCollabStore.getState().session?.sendAiCancel(activeDiagramId())
  },
  apply(messageId: string) {
    const { session, myName } = useCollabStore.getState()
    session?.sendAiApply(messageId, myName.trim() || 'Guest', activeDiagramId())
  },
  reject(messageId: string) {
    useCollabStore.getState().session?.sendAiReject(messageId, activeDiagramId())
  },
  /** The mirrored thread for the diagram this guest is viewing. */
  activeThread(): { messages: AiMessage[]; streaming: boolean } {
    const t = useAiStore.getState().remote?.threads[activeDiagramId()]
    return t
      ? { messages: t.messages as AiMessage[], streaming: t.streaming }
      : { messages: [], streaming: false }
  },
}
