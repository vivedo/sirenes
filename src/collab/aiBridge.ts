import { useAiStore, DEFAULT_MODEL_ID } from '../ai/aiStore'
import { useAiSettingsStore } from '../ai/aiSettingsStore'
import { applySourceEdit } from '../editor/applySourceEdit'
import { useCollabStore } from './collabStore'
import type { AiRequest, CollabSession, SharedAiState } from './session'
import type { AiMessage } from '../ai/types'
import { newId } from '../shared/id'

const PUBLISH_THROTTLE_MS = 80

/**
 * Connects a session to the AI store.
 *  - Host: publishes its assistant state (messages, streaming, model) to guests and executes
 *    guest requests with its own key, so everyone shares one conversation.
 *  - Guest: mirrors the host's state into `useAiStore().remote`.
 * Returns a teardown function.
 */
export function attachAiBridge(session: CollabSession): () => void {
  return session.role === 'host' ? attachHost(session) : attachGuest(session)
}

function snapshot(): SharedAiState {
  const ai = useAiStore.getState()
  return {
    enabled: session_enabled(),
    hasKey: ai.apiKey !== null && ai.keyStatus !== 'invalid',
    model: useAiSettingsStore.getState().selectedModelId ?? DEFAULT_MODEL_ID,
    streaming: ai.streaming,
    // Messages carry content, proposals, usage and authors. Never the key.
    messages: ai.messages as unknown[],
  }
}

function session_enabled(): boolean {
  return useCollabStore.getState().aiEnabled
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

  const unsubs = [
    useAiStore.subscribe((s, prev) => {
      if (
        s.messages !== prev.messages ||
        s.streaming !== prev.streaming ||
        s.apiKey !== prev.apiKey ||
        s.keyStatus !== prev.keyStatus
      )
        publish()
    }),
    useAiSettingsStore.subscribe((s, prev) => {
      if (s.selectedModelId !== prev.selectedModelId) publish()
    }),
    useCollabStore.subscribe((s, prev) => {
      if (s.aiEnabled !== prev.aiEnabled) publish()
    }),
    session.aiRequested.on((req: AiRequest) => {
      void useAiStore.getState().send(req.text, req.mode, req.author)
    }),
    session.aiCancelRequested.on(() => useAiStore.getState().cancel()),
    session.aiApplyRequested.on(({ messageId, author }) =>
      useAiStore.getState().applyProposal(messageId, applySourceEdit, author),
    ),
    session.aiRejectRequested.on(({ messageId }) =>
      useAiStore.getState().rejectProposal(messageId),
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
    session.aiState ?? {
      enabled: session.aiEnabled,
      hasKey: false,
      model: null,
      streaming: false,
      messages: [],
    },
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

/** Guest actions: forwarded to the host, who owns the conversation. */
export const sharedAi = {
  send(text: string, mode: 'edit' | 'explain' = 'edit') {
    const { session, myName } = useCollabStore.getState()
    if (!session || session.role !== 'guest') return
    session.sendAiRequest({ id: newId(), text, mode, author: myName.trim() || 'Guest' })
  },
  cancel() {
    useCollabStore.getState().session?.sendAiCancel()
  },
  apply(messageId: string) {
    const { session, myName } = useCollabStore.getState()
    session?.sendAiApply(messageId, myName.trim() || 'Guest')
  },
  reject(messageId: string) {
    useCollabStore.getState().session?.sendAiReject(messageId)
  },
  /** Find a mirrored message by id. */
  message(messageId: string): AiMessage | undefined {
    return (useAiStore.getState().remote?.messages as AiMessage[] | undefined)?.find(
      (m) => m.id === messageId,
    )
  },
}
