import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import { Emitter, type PeerLink, type Transport, type TransportFactory } from './transport'
import type { Diagram } from '../documents/multi'
import { newId } from '../shared/id'

export type Role = 'host' | 'guest'
export type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed'

export interface Participant {
  clientId: number
  name: string
  color: string
  isHost: boolean
  isSelf: boolean
  /** Diagram this participant is viewing. */
  diagramId: string | null
}

export interface SessionUser {
  name: string
  color: string
  colorLight: string
}

/** Snapshot of the host's assistant that guests mirror. Never includes the key. */
export interface SharedAiState {
  enabled: boolean
  hasKey: boolean
  model: string | null
  /** Threads keyed by diagram id. */
  threads: Record<string, { messages: unknown[]; streaming: boolean }>
}

export interface AiRequest {
  id: string
  text: string
  mode: 'edit' | 'explain'
  author: string
  diagramId: string
}

export interface SessionOptions {
  role: Role
  transportFactory: TransportFactory
  user: SessionUser
  /** Host: the file's diagrams. */
  diagrams?: Diagram[]
  theme?: string
  title?: string
  /** Host: resume with this id. Guest: id to join. */
  sessionId?: string
  canEdit?: boolean
  aiEnabled?: boolean
  /**
   * Host resume: the Y.Doc state saved before a reload. Restoring it keeps the same history as
   * the guests still connected, so nothing gets duplicated when they re-sync. When present,
   * `diagrams` is ignored.
   */
  initialState?: Uint8Array | null
  /** Guest reconnect cadence; tests shorten it. */
  reconnectIntervalMs?: number
}

const PROTOCOL_VERSION = 2
const RECONNECT_WINDOW_MS = 30_000
const RECONNECT_INTERVAL_MS = 2_000

/**
 * Bytes arrive in whatever shape the transport's serialiser produced: PeerJS's binarypack turns a
 * Uint8Array into an ArrayBuffer, JSON-ish paths turn it into an array or an index-keyed object.
 * Yjs's decoder needs a real Uint8Array.
 */
export function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Array.isArray(value)) return Uint8Array.from(value as number[])
  if (value && typeof value === 'object')
    return Uint8Array.from(Object.values(value as Record<string, number>))
  throw new Error('Malformed binary payload')
}

interface Wire {
  hello: { t: 'hello'; v: number; user: SessionUser }
  welcome: {
    t: 'welcome'
    v: number
    title: string
    canEdit: boolean
    aiEnabled: boolean
    host: SessionUser
  }
  step1: { t: 'step1'; sv: Uint8Array }
  step2: { t: 'step2'; update: Uint8Array }
  update: { t: 'update'; update: Uint8Array }
  awareness: { t: 'awareness'; update: Uint8Array }
  perm: { t: 'perm'; canEdit: boolean; aiEnabled: boolean }
  end: { t: 'end' }
  aiState: { t: 'ai-state'; state: SharedAiState }
  aiRequest: { t: 'ai-request'; request: AiRequest }
  aiCancel: { t: 'ai-cancel'; diagramId: string }
  aiApply: { t: 'ai-apply'; messageId: string; author: string; diagramId: string }
  aiReject: { t: 'ai-reject'; messageId: string; diagramId: string }
}
type WireMessage = Wire[keyof Wire]

/** A diagram as stored in the shared document. */
export type YDiagram = Y.Map<unknown>

/**
 * One live session, host or guest. The Y.Doc holds the whole file: an array of diagrams (each a
 * map with id, name and a Y.Text source) plus a meta map (theme, title). That is all that is
 * ever shared; files, Drive and AI keys never enter it.
 */
export class CollabSession {
  readonly role: Role
  readonly ydoc = new Y.Doc()
  readonly ydiagrams = this.ydoc.getArray<YDiagram>('diagrams')
  readonly ymeta = this.ydoc.getMap<string>('meta')
  readonly awareness = new Awareness(this.ydoc)
  private undoManagers = new Map<string, Y.UndoManager>()

  status: SessionStatus = 'connecting'
  sessionId = ''
  canEdit: boolean
  aiEnabled: boolean
  aiState: SharedAiState | null = null
  hostUser: SessionUser | null = null
  error: string | null = null

  readonly statusChanged = new Emitter<SessionStatus>()
  readonly participantsChanged = new Emitter<Participant[]>()
  readonly permissionChanged = new Emitter<boolean>()
  readonly aiPermissionChanged = new Emitter<boolean>()
  /** Guest side: the host published a new assistant state. */
  readonly aiStateChanged = new Emitter<SharedAiState>()
  /** Host side: a guest asked the assistant something. */
  readonly aiRequested = new Emitter<AiRequest>()
  readonly aiCancelRequested = new Emitter<{ diagramId: string }>()
  readonly aiApplyRequested = new Emitter<{
    messageId: string
    author: string
    diagramId: string
  }>()
  readonly aiRejectRequested = new Emitter<{ messageId: string; diagramId: string }>()

  private transport: Transport | null = null
  private links = new Map<PeerLink, Set<number>>()
  private hostLink: PeerLink | null = null
  private ended = false
  private readonly user: SessionUser
  private readonly factory: TransportFactory
  private readonly opts: SessionOptions

  constructor(opts: SessionOptions) {
    this.opts = opts
    this.role = opts.role
    this.user = opts.user
    this.factory = opts.transportFactory
    this.canEdit = opts.canEdit ?? true
    this.aiEnabled = opts.aiEnabled ?? true

    if (this.role === 'host') {
      if (opts.initialState && opts.initialState.length) {
        Y.applyUpdate(this.ydoc, opts.initialState)
      } else {
        this.ydoc.transact(() => {
          for (const d of opts.diagrams ?? []) this.ydiagrams.push([this.makeYDiagram(d)])
          this.ymeta.set('theme', opts.theme ?? 'default')
          this.ymeta.set('title', opts.title ?? 'Shared diagram')
        }, this.ydoc.clientID)
      }
      if (this.ydiagrams.length === 0) {
        this.ydoc.transact(
          () => this.ydiagrams.push([this.makeYDiagram({ id: newId(), name: null, source: '' })]),
          this.ydoc.clientID,
        )
      }
      this.hostUser = this.user
    }

    this.awareness.setLocalStateField('user', this.user)
    this.awareness.setLocalStateField('role', this.role)

    // Undo managers must exist before the first edit they are meant to track, so keep one per
    // diagram as the list changes (locally or from peers).
    this.ensureUndoManagers()
    this.ydiagrams.observe(() => this.ensureUndoManagers())

    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      this.broadcast({ t: 'update', update }, this.isLink(origin) ? origin : null)
    })
    this.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const changed = [...added, ...updated, ...removed]
        if (origin === 'local' || origin === null) {
          this.broadcast(
            { t: 'awareness', update: encodeAwarenessUpdate(this.awareness, changed) },
            null,
          )
        } else if (this.role === 'host' && this.isLink(origin)) {
          const set = this.links.get(origin)
          if (set) for (const id of added) set.add(id)
          this.broadcast(
            { t: 'awareness', update: encodeAwarenessUpdate(this.awareness, changed) },
            origin,
          )
        }
        this.participantsChanged.emit(this.participants())
      },
    )
  }

  private isLink(x: unknown): x is PeerLink {
    return typeof x === 'object' && x !== null && 'remoteId' in x
  }

  // ------------------------------------------------------------ diagrams

  private makeYDiagram(d: Diagram): YDiagram {
    const m = new Y.Map<unknown>()
    m.set('id', d.id)
    m.set('name', d.name)
    const text = new Y.Text()
    text.insert(0, d.source)
    m.set('source', text)
    return m
  }

  /** Plain snapshot of every diagram, in order. */
  diagrams(): Diagram[] {
    return this.ydiagrams.toArray().map((m) => ({
      id: String(m.get('id')),
      name: (m.get('name') as string | null) ?? null,
      source: (m.get('source') as Y.Text).toString(),
    }))
  }

  findYDiagram(id: string): YDiagram | null {
    return this.ydiagrams.toArray().find((m) => m.get('id') === id) ?? null
  }

  textFor(id: string): Y.Text | null {
    return (this.findYDiagram(id)?.get('source') as Y.Text | undefined) ?? null
  }

  private ensureUndoManagers() {
    const present = new Set<string>()
    for (const m of this.ydiagrams.toArray()) {
      const id = String(m.get('id'))
      present.add(id)
      if (!this.undoManagers.has(id)) {
        const text = m.get('source') as Y.Text
        this.undoManagers.set(
          id,
          new Y.UndoManager(text, { trackedOrigins: new Set([this.ydoc.clientID, null]) }),
        )
      }
    }
    for (const [id, um] of this.undoManagers) {
      if (!present.has(id)) {
        um.destroy()
        this.undoManagers.delete(id)
      }
    }
  }

  /** Per-diagram undo, tracking only this client's edits. */
  undoManagerFor(id: string): Y.UndoManager | null {
    this.ensureUndoManagers()
    return this.undoManagers.get(id) ?? null
  }

  private mayEdit(): boolean {
    return this.role === 'host' || this.canEdit
  }

  addDiagram(source = '', name: string | null = null): string | null {
    if (!this.mayEdit()) return null
    const d: Diagram = { id: newId(), name, source }
    this.ydoc.transact(() => this.ydiagrams.push([this.makeYDiagram(d)]), this.ydoc.clientID)
    return d.id
  }

  renameDiagram(id: string, name: string) {
    if (!this.mayEdit()) return
    const m = this.findYDiagram(id)
    if (m) this.ydoc.transact(() => m.set('name', name), this.ydoc.clientID)
  }

  removeDiagram(id: string): Diagram | null {
    if (!this.mayEdit() || this.ydiagrams.length <= 1) return null
    const arr = this.ydiagrams.toArray()
    const index = arr.findIndex((m) => m.get('id') === id)
    if (index === -1) return null
    const snapshot = this.diagrams()[index]
    this.ydoc.transact(() => this.ydiagrams.delete(index, 1), this.ydoc.clientID)
    return snapshot
  }

  insertDiagram(index: number, d: Diagram) {
    if (!this.mayEdit()) return
    const at = Math.min(Math.max(0, index), this.ydiagrams.length)
    this.ydoc.transact(() => this.ydiagrams.insert(at, [this.makeYDiagram(d)]), this.ydoc.clientID)
  }

  /** Replace a diagram's whole text (AI proposals for a diagram that may not be open in the editor). */
  replaceText(id: string, source: string) {
    const text = this.textFor(id)
    if (!text || !this.mayEdit()) return
    this.ydoc.transact(() => {
      text.delete(0, text.length)
      text.insert(0, source)
    }, this.ydoc.clientID)
  }

  /** Tell others which diagram we are looking at. */
  setViewing(diagramId: string | null) {
    this.awareness.setLocalStateField('diagramId', diagramId)
  }

  participants(): Participant[] {
    const out: Participant[] = []
    for (const [clientId, state] of this.awareness.getStates()) {
      const user = state.user as SessionUser | undefined
      if (!user) continue
      out.push({
        clientId,
        name: user.name,
        color: user.color,
        isHost: state.role === 'host',
        isSelf: clientId === this.ydoc.clientID,
        diagramId: (state.diagramId as string | null | undefined) ?? null,
      })
    }
    return out.sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name))
  }

  private setStatus(status: SessionStatus, error: string | null = null) {
    this.status = status
    this.error = error
    this.statusChanged.emit(status)
  }

  /** Full document state, for persisting across a host reload. */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.ydoc)
  }

  // ------------------------------------------------------------------ host

  async host(): Promise<string> {
    this.transport = await this.factory({ id: this.opts.sessionId })
    this.sessionId = this.transport.id
    this.transport.onIncoming((link) => this.acceptGuest(link))
    this.transport.onError((e) => {
      if (this.status === 'connected') this.error = e.message
    })
    this.setStatus('connected')
    return this.sessionId
  }

  private acceptGuest(link: PeerLink) {
    this.links.set(link, new Set())
    link.onMessage((m) => this.onMessage(link, m as WireMessage))
    link.onClose(() => this.dropGuest(link))
  }

  private dropGuest(link: PeerLink) {
    const ids = this.links.get(link)
    this.links.delete(link)
    if (ids && ids.size) removeAwarenessStates(this.awareness, [...ids], 'local')
    this.participantsChanged.emit(this.participants())
  }

  setCanEdit(canEdit: boolean) {
    if (this.role !== 'host') return
    this.canEdit = canEdit
    this.broadcast({ t: 'perm', canEdit, aiEnabled: this.aiEnabled }, null)
    this.permissionChanged.emit(canEdit)
  }

  setAiEnabled(aiEnabled: boolean) {
    if (this.role !== 'host') return
    this.aiEnabled = aiEnabled
    this.broadcast({ t: 'perm', canEdit: this.canEdit, aiEnabled }, null)
    this.aiPermissionChanged.emit(aiEnabled)
  }

  setTitle(title: string) {
    if (this.role !== 'host') return
    this.ydoc.transact(() => this.ymeta.set('title', title), this.ydoc.clientID)
  }

  setTheme(theme: string) {
    if (!this.mayEdit()) return
    this.ydoc.transact(() => this.ymeta.set('theme', theme), this.ydoc.clientID)
  }

  // ------------------------------------------------------------ shared AI

  publishAiState(state: SharedAiState) {
    if (this.role !== 'host') return
    this.aiState = state
    this.broadcast({ t: 'ai-state', state }, null)
  }

  sendAiRequest(request: AiRequest) {
    if (this.role !== 'guest' || !this.aiEnabled) return
    this.hostLink?.send({ t: 'ai-request', request } satisfies Wire['aiRequest'])
  }

  sendAiCancel(diagramId: string) {
    if (this.role !== 'guest') return
    this.hostLink?.send({ t: 'ai-cancel', diagramId } satisfies Wire['aiCancel'])
  }

  sendAiApply(messageId: string, author: string, diagramId: string) {
    if (this.role !== 'guest') return
    this.hostLink?.send({ t: 'ai-apply', messageId, author, diagramId } satisfies Wire['aiApply'])
  }

  sendAiReject(messageId: string, diagramId: string) {
    if (this.role !== 'guest') return
    this.hostLink?.send({ t: 'ai-reject', messageId, diagramId } satisfies Wire['aiReject'])
  }

  // ----------------------------------------------------------------- guest

  async join(): Promise<void> {
    if (!this.opts.sessionId) throw new Error('No session id')
    this.sessionId = this.opts.sessionId
    this.transport = await this.factory()
    await this.connectToHost(true)
  }

  private async connectToHost(first: boolean): Promise<void> {
    if (!this.transport || this.ended) return
    const link = await this.transport.connect(this.sessionId)
    this.hostLink = link
    link.onMessage((m) => this.onMessage(link, m as WireMessage))
    link.onClose(() => this.onHostLost())
    link.send({ t: 'hello', v: PROTOCOL_VERSION, user: this.user } satisfies Wire['hello'])
    if (!first) {
      link.send({ t: 'step1', sv: Y.encodeStateVector(this.ydoc) } satisfies Wire['step1'])
      link.send({
        t: 'awareness',
        update: encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID]),
      })
    }
  }

  private async onHostLost() {
    if (this.ended) return
    this.hostLink = null
    this.setStatus('reconnecting')
    const deadline = Date.now() + RECONNECT_WINDOW_MS
    while (Date.now() < deadline && !this.ended) {
      await new Promise((r) =>
        setTimeout(r, this.opts.reconnectIntervalMs ?? RECONNECT_INTERVAL_MS),
      )
      if (this.ended) return
      try {
        await this.connectToHost(false)
        this.setStatus('connected')
        return
      } catch {
        /* keep trying until the deadline */
      }
    }
    if (!this.ended) this.finish('ended', 'Lost the connection to the host.')
  }

  // -------------------------------------------------------------- protocol

  private onMessage(link: PeerLink, m: WireMessage) {
    try {
      this.handleMessage(link, m)
    } catch (e) {
      console.warn('[collab] dropped message', m?.t, e)
    }
  }

  private handleMessage(link: PeerLink, m: WireMessage) {
    switch (m.t) {
      case 'hello': {
        if (this.role !== 'host') return
        if (m.v !== PROTOCOL_VERSION) {
          link.send({ t: 'end' })
          link.close()
          return
        }
        link.send({
          t: 'welcome',
          v: PROTOCOL_VERSION,
          title: this.ymeta.get('title') ?? 'Shared diagram',
          canEdit: this.canEdit,
          aiEnabled: this.aiEnabled,
          host: this.user,
        } satisfies Wire['welcome'])
        if (this.aiState)
          link.send({ t: 'ai-state', state: this.aiState } satisfies Wire['aiState'])
        link.send({ t: 'step1', sv: Y.encodeStateVector(this.ydoc) })
        link.send({
          t: 'awareness',
          update: encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()]),
        })
        break
      }
      case 'welcome': {
        if (this.role !== 'guest') return
        this.hostUser = m.host
        this.canEdit = m.canEdit
        this.aiEnabled = m.aiEnabled ?? true
        this.permissionChanged.emit(m.canEdit)
        this.aiPermissionChanged.emit(this.aiEnabled)
        link.send({ t: 'step1', sv: Y.encodeStateVector(this.ydoc) })
        link.send({
          t: 'awareness',
          update: encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID]),
        })
        break
      }
      case 'step1':
        link.send({ t: 'step2', update: Y.encodeStateAsUpdate(this.ydoc, toBytes(m.sv)) })
        break
      case 'step2':
      case 'update':
        if (this.role === 'host' && !this.canEdit && m.t === 'update') return // read-only guests
        Y.applyUpdate(this.ydoc, toBytes(m.update), link)
        if (this.role === 'guest' && this.status !== 'connected') this.setStatus('connected')
        break
      case 'awareness':
        applyAwarenessUpdate(this.awareness, toBytes(m.update), link)
        break
      case 'perm':
        if (this.role !== 'guest') return
        this.canEdit = m.canEdit
        this.permissionChanged.emit(m.canEdit)
        if (typeof m.aiEnabled === 'boolean' && m.aiEnabled !== this.aiEnabled) {
          this.aiEnabled = m.aiEnabled
          this.aiPermissionChanged.emit(m.aiEnabled)
        }
        break
      case 'ai-state':
        if (this.role !== 'guest') return
        this.aiState = m.state
        this.aiStateChanged.emit(m.state)
        break
      case 'ai-request':
        if (this.role !== 'host' || !this.aiEnabled) return
        if (typeof m.request?.text !== 'string') return
        this.aiRequested.emit({
          id: String(m.request.id ?? ''),
          text: String(m.request.text).slice(0, 20_000),
          mode: m.request.mode === 'explain' ? 'explain' : 'edit',
          author: String(m.request.author ?? 'Guest').slice(0, 60),
          diagramId: String(m.request.diagramId ?? ''),
        })
        break
      case 'ai-cancel':
        if (this.role === 'host' && this.aiEnabled)
          this.aiCancelRequested.emit({ diagramId: String(m.diagramId) })
        break
      case 'ai-apply':
        if (this.role === 'host' && this.aiEnabled && this.canEdit)
          this.aiApplyRequested.emit({
            messageId: String(m.messageId),
            author: String(m.author ?? 'Guest').slice(0, 60),
            diagramId: String(m.diagramId),
          })
        break
      case 'ai-reject':
        if (this.role === 'host' && this.aiEnabled)
          this.aiRejectRequested.emit({
            messageId: String(m.messageId),
            diagramId: String(m.diagramId),
          })
        break
      case 'end':
        if (this.role === 'guest') this.finish('ended', 'The host ended the session.')
        break
    }
  }

  private broadcast(m: WireMessage, except: PeerLink | null) {
    if (this.role === 'host') {
      for (const link of this.links.keys()) if (link !== except) link.send(m)
    } else if (this.hostLink && this.hostLink !== except) {
      this.hostLink.send(m)
    }
  }

  // --------------------------------------------------------------- teardown

  /** Host: end for everyone. Guest: leave. Either way the local Y.Doc keeps its content. */
  end() {
    if (this.ended) return
    if (this.role === 'host') this.broadcast({ t: 'end' }, null)
    this.finish('ended', null)
  }

  private finish(status: SessionStatus, error: string | null) {
    if (this.ended) return
    this.ended = true
    this.transport?.destroy()
    this.transport = null
    this.links.clear()
    this.hostLink = null
    this.setStatus(status, error)
  }

  /** Release Yjs resources. Call after the editor has been detached. */
  destroy() {
    this.end()
    this.awareness.destroy()
    for (const um of this.undoManagers.values()) um.destroy()
    this.undoManagers.clear()
    this.ydoc.destroy()
  }
}
