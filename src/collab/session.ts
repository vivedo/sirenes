import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import { Emitter, type PeerLink, type Transport, type TransportFactory } from './transport'

export type Role = 'host' | 'guest'
export type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed'

export interface Participant {
  clientId: number
  name: string
  color: string
  isHost: boolean
  isSelf: boolean
}

export interface SessionUser {
  name: string
  color: string
  colorLight: string
}

export interface SessionOptions {
  role: Role
  transportFactory: TransportFactory
  user: SessionUser
  /** Host: initial content. */
  source?: string
  theme?: string
  title?: string
  /** Host: resume with this id. Guest: id to join. */
  sessionId?: string
  canEdit?: boolean
  aiEnabled?: boolean
}

const PROTOCOL_VERSION = 1

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
const RECONNECT_WINDOW_MS = 30_000
const RECONNECT_INTERVAL_MS = 2_000

/** Snapshot of the host's assistant that guests mirror. Never includes the key. */
export interface SharedAiState {
  enabled: boolean
  hasKey: boolean
  model: string | null
  streaming: boolean
  messages: unknown[]
}

export interface AiRequest {
  id: string
  text: string
  mode: 'edit' | 'explain'
  author: string
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
  aiCancel: { t: 'ai-cancel' }
  aiApply: { t: 'ai-apply'; messageId: string; author: string }
  aiReject: { t: 'ai-reject'; messageId: string }
}
type WireMessage = Wire[keyof Wire]

/**
 * One live session, host or guest. Owns the Y.Doc (source text + meta map) and the awareness
 * instance; talks to peers over the transport. The Y.Doc deliberately contains nothing but
 * `source` and `meta` (theme, title): that is the privacy boundary of LC-3.
 */
export class CollabSession {
  readonly role: Role
  readonly ydoc = new Y.Doc()
  readonly ytext = this.ydoc.getText('source')
  readonly ymeta = this.ydoc.getMap<string>('meta')
  readonly awareness = new Awareness(this.ydoc)
  readonly undoManager: Y.UndoManager

  status: SessionStatus = 'connecting'
  sessionId = ''
  canEdit: boolean
  /** Host: whether guests may use the host's AI assistant. Guest: what the host allows. */
  aiEnabled: boolean
  /** Guest: last mirrored assistant state. Host: last state it published. */
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
  readonly aiCancelRequested = new Emitter<void>()
  readonly aiApplyRequested = new Emitter<{ messageId: string; author: string }>()
  readonly aiRejectRequested = new Emitter<{ messageId: string }>()

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
    // Local edits carry the ydoc's clientID as origin so the UndoManager only tracks our own.
    this.undoManager = new Y.UndoManager(this.ytext, {
      trackedOrigins: new Set([this.ydoc.clientID, null]),
    })

    if (this.role === 'host') {
      this.ydoc.transact(() => {
        if (opts.source) this.ytext.insert(0, opts.source)
        this.ymeta.set('theme', opts.theme ?? 'default')
        this.ymeta.set('title', opts.title ?? 'Shared diagram')
      }, this.ydoc.clientID)
      this.hostUser = this.user
    }

    this.awareness.setLocalStateField('user', this.user)
    this.awareness.setLocalStateField('role', this.role)

    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      // Remote updates arrive with the link as origin; relay them to everyone else.
      this.broadcast(
        { t: 'update', update },
        origin instanceof Object ? (origin as PeerLink) : null,
      )
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
          // Track which client ids belong to which link, so we can clean up when it drops.
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
      })
    }
    return out.sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name))
  }

  private setStatus(status: SessionStatus, error: string | null = null) {
    this.status = status
    this.error = error
    this.statusChanged.emit(status)
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

  // ------------------------------------------------------------ shared AI

  /** Host: publish the assistant state to every guest (and remember it for late joiners). */
  publishAiState(state: SharedAiState) {
    if (this.role !== 'host') return
    this.aiState = state
    this.broadcast({ t: 'ai-state', state }, null)
  }

  /** Guest: ask the host's assistant. */
  sendAiRequest(request: AiRequest) {
    if (this.role !== 'guest' || !this.aiEnabled) return
    this.hostLink?.send({ t: 'ai-request', request } satisfies Wire['aiRequest'])
  }

  sendAiCancel() {
    if (this.role !== 'guest') return
    this.hostLink?.send({ t: 'ai-cancel' } satisfies Wire['aiCancel'])
  }

  sendAiApply(messageId: string, author: string) {
    if (this.role !== 'guest') return
    this.hostLink?.send({ t: 'ai-apply', messageId, author } satisfies Wire['aiApply'])
  }

  sendAiReject(messageId: string) {
    if (this.role !== 'guest') return
    this.hostLink?.send({ t: 'ai-reject', messageId } satisfies Wire['aiReject'])
  }

  setTitle(title: string) {
    if (this.role !== 'host') return
    this.ydoc.transact(() => this.ymeta.set('title', title), this.ydoc.clientID)
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
      // Re-sync after a reconnect; our local edits made while offline flow back with step1/step2.
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
      await new Promise((r) => setTimeout(r, RECONNECT_INTERVAL_MS))
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
      // A malformed message from one peer must not take the whole session down.
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
        })
        break
      case 'ai-cancel':
        if (this.role === 'host' && this.aiEnabled) this.aiCancelRequested.emit()
        break
      case 'ai-apply':
        // Applying a proposal edits the shared diagram, so it follows the edit permission.
        if (this.role === 'host' && this.aiEnabled && this.canEdit)
          this.aiApplyRequested.emit({
            messageId: String(m.messageId),
            author: String(m.author ?? 'Guest').slice(0, 60),
          })
        break
      case 'ai-reject':
        if (this.role === 'host' && this.aiEnabled)
          this.aiRejectRequested.emit({ messageId: String(m.messageId) })
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
    this.undoManager.destroy()
    this.ydoc.destroy()
  }
}
