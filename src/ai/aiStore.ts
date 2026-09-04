import { create } from 'zustand'
import type { ModelInfo, KeyInfo } from './openrouter'
import { listModels, streamChat, validateKey, OpenRouterError } from './openrouter'
import { clearApiKey, readApiKey, writeApiKey, type KeyStorageMode } from './keyStorage'
import { buildMessages, type PromptMode } from './prompt'
import { extractMermaidBlock } from './proposal'
import { readHistory, writeHistory } from './history'
import type { AiMessage, KeyStatus } from './types'
import type { SharedAiState } from '../collab/session'
import { useAiSettingsStore } from './aiSettingsStore'
import { useDocumentStore } from '../store/documentStore'
import { validateMermaid } from '../preview/renderer'
import { newId } from '../shared/id'

export const DEFAULT_MODEL_ID = 'openrouter/auto'

interface AiStore {
  apiKey: string | null
  keyStatus: KeyStatus
  keyInfo: KeyInfo | null
  keyError: string | null

  models: ModelInfo[]
  modelsStatus: 'idle' | 'loading' | 'ready' | 'error'
  modelsError: string | null

  /** Document id the current conversation belongs to. */
  conversationDocId: string | null
  messages: AiMessage[]
  streaming: boolean
  abort: AbortController | null

  reviewMessageId: string | null
  /** Guest in a live session: mirror of the host's assistant. null otherwise. */
  remote: SharedAiState | null

  // key
  loadKeyFromStorage: () => void
  setKey: (key: string, mode: KeyStorageMode) => Promise<void>
  removeKey: () => void
  // models
  ensureModels: () => Promise<void>
  // conversation
  loadConversation: (docId: string) => Promise<void>
  send: (request: string, mode?: PromptMode, author?: string) => Promise<void>
  cancel: () => void
  clearConversation: () => void
  applyProposal: (messageId: string, apply: (code: string) => void, appliedBy?: string) => void
  rejectProposal: (messageId: string) => void
  openReview: (messageId: string | null) => void
  setRemote: (remote: SharedAiState | null) => void
}

/** Write history now. Streaming deltas are not persisted; only completed turns are. */
function persistHistory(docId: string, messages: AiMessage[]) {
  void writeHistory(docId, messages)
}

export const useAiStore = create<AiStore>((set, get) => ({
  apiKey: null,
  keyStatus: 'none',
  keyInfo: null,
  keyError: null,

  models: [],
  modelsStatus: 'idle',
  modelsError: null,

  conversationDocId: null,
  messages: [],
  streaming: false,
  abort: null,
  reviewMessageId: null,
  remote: null,

  loadKeyFromStorage: () => {
    const stored = readApiKey()
    if (!stored) return
    useAiSettingsStore.getState().setKeyStorageMode(stored.mode)
    // Assume valid until proven otherwise; a 401 on first use will flip it.
    set({ apiKey: stored.key, keyStatus: 'valid', keyError: null })
    void validateKey(stored.key)
      .then((info) => set({ keyInfo: info }))
      .catch((e: unknown) => {
        if (e instanceof OpenRouterError && e.status === 401)
          set({ keyStatus: 'invalid', keyError: e.message })
      })
  },

  setKey: async (key, mode) => {
    const trimmed = key.trim()
    if (!trimmed) return
    set({ keyStatus: 'checking', keyError: null })
    try {
      const info = await validateKey(trimmed)
      writeApiKey(trimmed, mode)
      useAiSettingsStore.getState().setKeyStorageMode(mode)
      set({ apiKey: trimmed, keyStatus: 'valid', keyInfo: info, keyError: null })
    } catch (e) {
      set({
        keyStatus: 'invalid',
        keyError: e instanceof Error ? e.message : 'Could not validate key',
      })
    }
  },

  removeKey: () => {
    clearApiKey()
    set({ apiKey: null, keyStatus: 'none', keyInfo: null, keyError: null })
  },

  ensureModels: async () => {
    if (get().modelsStatus === 'loading' || get().modelsStatus === 'ready') return
    set({ modelsStatus: 'loading', modelsError: null })
    try {
      const models = await listModels()
      set({ models, modelsStatus: 'ready' })
    } catch (e) {
      set({
        modelsStatus: 'error',
        modelsError: e instanceof Error ? e.message : 'Could not load models',
      })
    }
  },

  loadConversation: async (docId) => {
    const { conversationDocId, messages } = get()
    if (conversationDocId === docId) return
    const pin = useAiSettingsStore.getState().pinConversation
    if (pin && conversationDocId && messages.length) {
      // Carry the conversation over to the new document.
      set({ conversationDocId: docId })
      persistHistory(docId, messages)
      return
    }
    const loaded = await readHistory(docId)
    // The user may have switched documents again while we were reading.
    if (useDocumentStore.getState().doc.id !== docId) return
    set({ conversationDocId: docId, messages: loaded, reviewMessageId: null })
  },

  send: async (request, mode = 'edit', author) => {
    const state = get()
    if (state.streaming || !state.apiKey || !request.trim()) return
    const doc = useDocumentStore.getState().doc
    const renderError = useDocumentStore.getState().render.error
    const model = useAiSettingsStore.getState().selectedModelId ?? DEFAULT_MODEL_ID

    const userMsg: AiMessage = {
      id: newId(),
      role: 'user',
      content: request.trim(),
      createdAt: Date.now(),
      ...(author ? { author } : {}),
    }
    const assistantMsg: AiMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
      model,
      createdAt: Date.now(),
    }
    const abort = new AbortController()
    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      streaming: true,
      abort,
      conversationDocId: s.conversationDocId ?? doc.id,
    }))

    const update = (patch: Partial<AiMessage>) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)),
      }))

    const history = state.messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const result = await streamChat({
        key: state.apiKey,
        model,
        signal: abort.signal,
        messages: buildMessages({ source: doc.source, request, mode, history, error: renderError }),
        onDelta: (delta) =>
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
            ),
          })),
      })

      const code =
        mode === 'edit' || result.content.includes('```')
          ? extractMermaidBlock(result.content)
          : null
      let proposal: AiMessage['proposal']
      if (code && code.trim() !== doc.source.trim()) {
        const error = await validateMermaid(code)
        proposal = { code, error, applied: false }
      }
      update({ content: result.content, usage: result.usage, proposal })
    } catch (e) {
      if (abort.signal.aborted) {
        update({ error: 'Cancelled' })
      } else {
        const message = e instanceof Error ? e.message : 'Request failed'
        update({ error: message })
        if (e instanceof OpenRouterError && e.status === 401)
          set({ keyStatus: 'invalid', keyError: message })
      }
    } finally {
      set({ streaming: false, abort: null })
      const s = get()
      if (s.conversationDocId) persistHistory(s.conversationDocId, s.messages)
    }
  },

  cancel: () => get().abort?.abort(),

  clearConversation: () => {
    const docId = get().conversationDocId
    set({ messages: [], reviewMessageId: null })
    if (docId) persistHistory(docId, [])
  },

  applyProposal: (messageId, apply, appliedBy) => {
    const msg = get().messages.find((m) => m.id === messageId)
    if (!msg?.proposal || msg.proposal.applied) return
    apply(msg.proposal.code)
    set((s) => ({
      reviewMessageId: null,
      messages: s.messages.map((m) =>
        m.id === messageId && m.proposal
          ? {
              ...m,
              proposal: { ...m.proposal, applied: true },
              ...(appliedBy ? { appliedBy } : {}),
            }
          : m,
      ),
    }))
    const s = get()
    if (s.conversationDocId) persistHistory(s.conversationDocId, s.messages)
  },

  rejectProposal: (messageId) => {
    set((s) => ({
      reviewMessageId: null,
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, proposal: undefined } : m)),
    }))
    const s = get()
    if (s.conversationDocId) persistHistory(s.conversationDocId, s.messages)
  },

  openReview: (reviewMessageId) => set({ reviewMessageId }),
  setRemote: (remote) => set({ remote }),
}))
