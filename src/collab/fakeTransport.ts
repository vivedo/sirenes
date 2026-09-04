import {
  Emitter,
  randomPeerId,
  type Message,
  type PeerLink,
  type Transport,
  type TransportOptions,
} from './transport'

/**
 * Test transport. Peers talk over a shared bus: BroadcastChannel when available (works across
 * tabs of one browser, which is what the e2e suite needs), else an in-process bus.
 */
type BusMessage =
  | { type: 'dial'; from: string; to: string; linkId: string }
  | { type: 'answer'; from: string; to: string; linkId: string; ok: boolean }
  | { type: 'data'; linkId: string; from: string; payload: Message }
  | { type: 'close'; linkId: string; from: string }

interface Bus {
  post(m: BusMessage): void
  on(cb: (m: BusMessage) => void): () => void
  close(): void
}

const CHANNEL = 'sirenes-collab-fake'
const inProcess = new Emitter<BusMessage>()

function makeBus(): Bus {
  if (typeof BroadcastChannel !== 'undefined') {
    const bc = new BroadcastChannel(CHANNEL)
    const em = new Emitter<BusMessage>()
    bc.onmessage = (e) => em.emit(e.data as BusMessage)
    // BroadcastChannel already reaches every other channel instance, in this tab and others.
    return { post: (m) => bc.postMessage(m), on: (cb) => em.on(cb), close: () => bc.close() }
  }
  return { post: (m) => inProcess.emit(m), on: (cb) => inProcess.on(cb), close: () => {} }
}

class FakeLink implements PeerLink {
  private messages = new Emitter<Message>()
  private closed = new Emitter<void>()
  private isClosed = false
  readonly remoteId: string
  readonly linkId: string
  private readonly bus: Bus
  private readonly selfId: string
  constructor(remoteId: string, linkId: string, bus: Bus, selfId: string) {
    this.remoteId = remoteId
    this.linkId = linkId
    this.bus = bus
    this.selfId = selfId
  }
  send(message: Message) {
    if (this.isClosed) return
    // Simulate the wire: structured clone so senders cannot share object identity with receivers.
    this.bus.post({
      type: 'data',
      linkId: this.linkId,
      from: this.selfId,
      payload: structuredClone(message),
    })
  }
  close() {
    if (this.isClosed) return
    this.bus.post({ type: 'close', linkId: this.linkId, from: this.selfId })
    this.handleClosed()
  }
  onMessage(cb: (m: Message) => void) {
    return this.messages.on(cb)
  }
  onClose(cb: () => void) {
    return this.closed.on(cb)
  }
  handleData(payload: Message) {
    if (!this.isClosed) this.messages.emit(payload)
  }
  handleClosed() {
    if (this.isClosed) return
    this.isClosed = true
    this.closed.emit()
    this.messages.clear()
    this.closed.clear()
  }
}

/** Peers that exist right now, so dialling an unknown id fails like a real unreachable host. */
const alive = new Set<string>()

export class FakeTransport implements Transport {
  readonly id: string
  private bus = makeBus()
  private links = new Map<string, FakeLink>()
  private incoming = new Emitter<PeerLink>()
  private errors = new Emitter<Error>()
  private unsub: () => void

  constructor(opts: TransportOptions = {}) {
    this.id = opts.id ?? randomPeerId()
    alive.add(this.id)
    announcePresence(this.id, true)
    this.unsub = this.bus.on((m) => this.handle(m))
  }

  private handle(m: BusMessage) {
    if (m.type === 'dial' && m.to === this.id) {
      const link = new FakeLink(m.from, m.linkId, this.bus, this.id)
      this.links.set(m.linkId, link)
      this.bus.post({ type: 'answer', from: this.id, to: m.from, linkId: m.linkId, ok: true })
      this.incoming.emit(link)
    } else if (m.type === 'data') {
      if (m.from === this.id) return
      this.links.get(m.linkId)?.handleData(m.payload)
    } else if (m.type === 'close') {
      if (m.from === this.id) return
      const link = this.links.get(m.linkId)
      if (link) {
        this.links.delete(m.linkId)
        link.handleClosed()
      }
    }
  }

  connect(remoteId: string): Promise<PeerLink> {
    return new Promise((resolve, reject) => {
      const linkId = randomPeerId(12)
      const link = new FakeLink(remoteId, linkId, this.bus, this.id)
      const timer = setTimeout(() => {
        off()
        reject(new Error('Could not reach peer'))
      }, 300)
      const off = this.bus.on((m) => {
        if (m.type === 'answer' && m.linkId === linkId && m.to === this.id) {
          clearTimeout(timer)
          off()
          if (!m.ok) return reject(new Error('Peer refused the connection'))
          this.links.set(linkId, link)
          resolve(link)
        }
      })
      this.bus.post({ type: 'dial', from: this.id, to: remoteId, linkId })
    })
  }

  onIncoming(cb: (link: PeerLink) => void) {
    return this.incoming.on(cb)
  }
  onError(cb: (e: Error) => void) {
    return this.errors.on(cb)
  }
  destroy() {
    for (const link of this.links.values()) link.close()
    this.links.clear()
    alive.delete(this.id)
    announcePresence(this.id, false)
    this.unsub()
    this.bus.close()
  }
}

function announcePresence(_id: string, _present: boolean) {
  /* reserved for cross-tab presence; dialling an absent peer times out instead */
}

export const createFakeTransport = async (opts?: TransportOptions): Promise<Transport> =>
  new FakeTransport(opts)
