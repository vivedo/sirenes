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

interface Wire {
  hello: { t: 'hello'; v: number; user: SessionUser }
  welcome: { t: 'welcome'; v: number; title: string; canEdit: boolean; host: SessionUser }
  step1: { t: 'step1'; sv: Uint8Array }
  step2: { t: 'step2'; update: Uint8Array }
  update: { t: 'update'; update: Uint8Array }
  awareness: { t: 'awareness'; update: Uint8Array }
  perm: { t: 'perm'; canEdit: boolean }
  end: { t: 'end' }
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
  hostUser: SessionUser | null = null
  error: string | null = null

  readonly statusChanged = new Emitter<SessionStatus>()
  readonly participantsChanged = new Emitter<Participant[]>()
  readonly permissionChanged = new Emitter<boolean>()

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
    this.broadcast({ t: 'perm', canEdit }, null)
    this.permissionChanged.emit(canEdit)
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
          host: this.user,
        } satisfies Wire['welcome'])
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
        this.permissionChanged.emit(m.canEdit)
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
