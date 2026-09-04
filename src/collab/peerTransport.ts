import type { DataConnection, Peer as PeerType, PeerOptions } from 'peerjs'
import {
  Emitter,
  randomPeerId,
  type Message,
  type PeerLink,
  type Transport,
  type TransportOptions,
} from './transport'

export interface PeerConfig {
  host?: string
  port?: number
  path?: string
  secure?: boolean
  iceServers?: RTCIceServer[]
}

/** Build-time signalling configuration. Defaults to the public PeerJS cloud with Google STUN. */
export function peerConfigFromEnv(): PeerConfig {
  const env = import.meta.env
  const cfg: PeerConfig = {}
  if (env.VITE_PEER_HOST) cfg.host = env.VITE_PEER_HOST
  if (env.VITE_PEER_PORT) cfg.port = Number(env.VITE_PEER_PORT)
  if (env.VITE_PEER_PATH) cfg.path = env.VITE_PEER_PATH
  if (env.VITE_PEER_SECURE) cfg.secure = env.VITE_PEER_SECURE !== 'false'
  if (env.VITE_PEER_ICE) {
    try {
      cfg.iceServers = JSON.parse(env.VITE_PEER_ICE) as RTCIceServer[]
    } catch {
      console.warn('VITE_PEER_ICE is not valid JSON; using defaults')
    }
  }
  return cfg
}

class PeerJsLink implements PeerLink {
  private messages = new Emitter<Message>()
  private closed = new Emitter<void>()
  readonly remoteId: string
  private readonly conn: DataConnection
  constructor(conn: DataConnection) {
    this.conn = conn
    this.remoteId = conn.peer
    conn.on('data', (data) => this.messages.emit(data as Message))
    conn.on('close', () => this.closed.emit())
    conn.on('error', () => this.closed.emit())
  }
  send(message: Message) {
    if (this.conn.open) void this.conn.send(message)
  }
  close() {
    this.conn.close()
  }
  onMessage(cb: (m: Message) => void) {
    return this.messages.on(cb)
  }
  onClose(cb: () => void) {
    return this.closed.on(cb)
  }
}

function friendly(err: unknown): Error {
  const type = (err as { type?: string })?.type
  const map: Record<string, string> = {
    'peer-unavailable': 'Nobody is hosting that session (or the host is offline).',
    'unavailable-id': 'That session id is already in use.',
    network: 'Could not reach the signalling server.',
    'server-error': 'The signalling server returned an error.',
    'browser-incompatible': 'This browser does not support WebRTC.',
    disconnected: 'Disconnected from the signalling server.',
  }
  return new Error(type && map[type] ? map[type] : ((err as Error)?.message ?? 'Connection failed'))
}

/** PeerJS-backed transport. Loaded lazily; peerjs is only imported when a session starts. */
export async function createPeerTransport(opts: TransportOptions = {}): Promise<Transport> {
  const { Peer } = await import('peerjs')
  const cfg = peerConfigFromEnv()
  const peerOptions: PeerOptions = {
    debug: 0,
    ...(cfg.host ? { host: cfg.host } : {}),
    ...(cfg.port ? { port: cfg.port } : {}),
    ...(cfg.path ? { path: cfg.path } : {}),
    ...(cfg.secure !== undefined ? { secure: cfg.secure } : {}),
    ...(cfg.iceServers ? { config: { iceServers: cfg.iceServers } } : {}),
  }
  const id = opts.id ?? randomPeerId()
  const peer: PeerType = new Peer(id, peerOptions)
  const incoming = new Emitter<PeerLink>()
  const errors = new Emitter<Error>()

  await new Promise<void>((resolve, reject) => {
    peer.once('open', () => resolve())
    peer.once('error', (e) => reject(friendly(e)))
  })
  peer.on('error', (e) => errors.emit(friendly(e)))
  peer.on('connection', (conn) => {
    conn.once('open', () => incoming.emit(new PeerJsLink(conn)))
  })
  // If the signalling socket drops, try to get it back so new guests can still find us.
  peer.on('disconnected', () => {
    if (!peer.destroyed) peer.reconnect()
  })

  return {
    id: peer.id,
    connect(remoteId) {
      return new Promise((resolve, reject) => {
        const conn = peer.connect(remoteId, { reliable: true })
        const timer = setTimeout(() => reject(new Error('Connection timed out')), 15_000)
        conn.once('open', () => {
          clearTimeout(timer)
          resolve(new PeerJsLink(conn))
        })
        conn.once('error', (e) => {
          clearTimeout(timer)
          reject(friendly(e))
        })
        // PeerJS reports "peer-unavailable" on the Peer, not the connection.
        const onPeerError = (e: unknown) => {
          if ((e as { type?: string }).type === 'peer-unavailable') {
            clearTimeout(timer)
            peer.off('error', onPeerError)
            reject(friendly(e))
          }
        }
        peer.on('error', onPeerError)
      })
    },
    onIncoming: (cb) => incoming.on(cb),
    onError: (cb) => errors.on(cb),
    destroy: () => peer.destroy(),
  }
}
