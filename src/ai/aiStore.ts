import { create } from 'zustand'
import type { ModelInfo, KeyInfo } from './openrouter'
import { listModels, streamChat, validateKey, OpenRouterError } from './openrouter'
import { clearApiKey, readApiKey, writeApiKey, type KeyStorageMode } from './keyStorage'
import { buildMessages, type PromptMode } from './prompt'
import { extractMermaidBlock } from './proposal'
import { readHistory, threadKey, writeHistory } from './history'
import type { AiMessage, KeyStatus } from './types'
import type { SharedAiState } from '../collab/session'
import { useAiSettingsStore } from './aiSettingsStore'
import { useDocumentStore } from '../store/documentStore'
import { validateMermaid } from '../preview/renderer'
import { newId } from '../shared/id'

export const DEFAULT_MODEL_ID = 'openrouter/auto'

export interface AiThread {
  messages: AiMessage[]
  streaming: boolean
  abort: AbortController | null
}

const EMPTY_THREAD: AiThread = { messages: [], streaming: false, abort: null }

export interface SendOptions {
  /** Thread to append to; defaults to the active one. */
  key?: string
  /** Diagram source to reason about; defaults to the active diagram. */
  source?: string
  author?: string
}

interface AiStore {
  apiKey: string | null
  keyStatus: KeyStatus
  keyInfo: KeyInfo | null
  keyError: string | null

  models: ModelInfo[]
  modelsStatus: 'idle' | 'loading' | 'ready' | 'error'
  modelsError: string | null

  /** Conversations, one per diagram, keyed by threadKey(docId, diagramId). */
  threads: Record<string, AiThread>
  /** Thread shown in the panel: the active diagram of the active document. */
  activeKey: string | null
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
  /** Make a thread active, loading it from storage if needed. */
  activateThread: (key: string) => Promise<void>
  send: (request: string, mode?: PromptMode, opts?: SendOptions) => Promise<void>
  cancel: (key?: string) => void
  clearConversation: (key?: string) => void
  applyProposal: (
    messageId: string,
    apply: (code: string) => void,
    appliedBy?: string,
    key?: string,
  ) => void
  rejectProposal: (messageId: string, key?: string) => void
  openReview: (messageId: string | null) => void
  setRemote: (remote: SharedAiState | null) => void
}

/** Write history now. Streaming deltas are not persisted; only completed turns are. */
function persistHistory(key: string, messages: AiMessage[]) {
  void writeHistory(key, messages)
}

/** Thread key for the active diagram of the active document. */
export function activeThreadKey(): string {
  const { doc } = useDocumentStore.getState()
  return threadKey(doc.id, doc.diagrams[doc.active]?.id ?? 'main')
}

/** Selector for the panel. */
export const selectActiveThread = (s: {
  threads: Record<string, AiThread>
  activeKey: string | null
}): AiThread => (s.activeKey && s.threads[s.activeKey]) || EMPTY_THREAD

export const useAiStore = create<AiStore>((set, get) => ({
  apiKey: null,
  keyStatus: 'none',
  keyInfo: null,
  keyError: null,

  models: [],
  modelsStatus: 'idle',
  modelsError: null,

  threads: {},
  activeKey: null,
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

  activateThread: async (key) => {
    if (get().activeKey === key) return
    set({ activeKey: key, reviewMessageId: null })
    if (get().threads[key]) return
    const messages = await readHistory(key)
    set((s) =>
      s.threads[key] ? s : { threads: { ...s.threads, [key]: { ...EMPTY_THREAD, messages } } },
    )
  },

  send: async (request, mode = 'edit', opts = {}) => {
    const state = get()
    const key = opts.key ?? state.activeKey
    if (!key || !state.apiKey || !request.trim()) return
    const thread = state.threads[key] ?? EMPTY_THREAD
    if (thread.streaming) return
    const docState = useDocumentStore.getState()
    const source = opts.source ?? docState.doc.source
    const renderError = opts.source === undefined ? docState.render.error : null
    const model = useAiSettingsStore.getState().selectedModelId ?? DEFAULT_MODEL_ID

    const userMsg: AiMessage = {
      id: newId(),
      role: 'user',
      content: request.trim(),
      createdAt: Date.now(),
      ...(opts.author ? { author: opts.author } : {}),
    }
    const assistantMsg: AiMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
      model,
      createdAt: Date.now(),
    }
    const abort = new AbortController()
    const patchThread = (fn: (t: AiThread) => AiThread) =>
      set((s) => ({ threads: { ...s.threads, [key]: fn(s.threads[key] ?? EMPTY_THREAD) } }))
    patchThread((t) => ({
      messages: [...t.messages, userMsg, assistantMsg],
      streaming: true,
      abort,
    }))

    const update = (patch: Partial<AiMessage>) =>
      patchThread((t) => ({
        ...t,
        messages: t.messages.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)),
      }))

    const history = thread.messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const result = await streamChat({
        key: state.apiKey,
        model,
        signal: abort.signal,
        messages: buildMessages({ source, request, mode, history, error: renderError }),
        onDelta: (delta) =>
          patchThread((t) => ({
            ...t,
            messages: t.messages.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
            ),
          })),
      })

      const code =
        mode === 'edit' || result.content.includes('```')
          ? extractMermaidBlock(result.content)
          : null
      let proposal: AiMessage['proposal']
      if (code && code.trim() !== source.trim()) {
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
      patchThread((t) => ({ ...t, streaming: false, abort: null }))
      persistHistory(key, get().threads[key]?.messages ?? [])
    }
  },

  cancel: (key) => {
    const k = key ?? get().activeKey
    if (k) get().threads[k]?.abort?.abort()
  },

  clearConversation: (key) => {
    const k = key ?? get().activeKey
    if (!k) return
    set((s) => ({ threads: { ...s.threads, [k]: { ...EMPTY_THREAD } }, reviewMessageId: null }))
    persistHistory(k, [])
  },

  applyProposal: (messageId, apply, appliedBy, key) => {
    const k = key ?? get().activeKey
    if (!k) return
    const msg = get().threads[k]?.messages.find((m) => m.id === messageId)
    if (!msg?.proposal || msg.proposal.applied) return
    apply(msg.proposal.code)
    set((s) => ({
      reviewMessageId: null,
      threads: {
        ...s.threads,
        [k]: {
          ...s.threads[k],
          messages: s.threads[k].messages.map((m) =>
            m.id === messageId && m.proposal
              ? {
                  ...m,
                  proposal: { ...m.proposal, applied: true },
                  ...(appliedBy ? { appliedBy } : {}),
                }
              : m,
          ),
        },
      },
    }))
    persistHistory(k, get().threads[k].messages)
  },

  rejectProposal: (messageId, key) => {
    const k = key ?? get().activeKey
    if (!k || !get().threads[k]) return
    set((s) => ({
      reviewMessageId: null,
      threads: {
        ...s.threads,
        [k]: {
          ...s.threads[k],
          messages: s.threads[k].messages.map((m) =>
            m.id === messageId ? { ...m, proposal: undefined } : m,
          ),
        },
      },
    }))
    persistHistory(k, get().threads[k].messages)
  },

  openReview: (reviewMessageId) => set({ reviewMessageId }),
  setRemote: (remote) => set({ remote }),
}))
