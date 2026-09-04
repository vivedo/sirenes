/**
 * Minimal peer transport abstraction. The real implementation wraps PeerJS; tests and the e2e
 * build use an in-memory / BroadcastChannel fake with the same shape.
 */
export type Message = Record<string, unknown>

export interface PeerLink {
  /** Remote peer id. */
  readonly remoteId: string
  send(message: Message): void
  close(): void
  onMessage(cb: (message: Message) => void): () => void
  onClose(cb: () => void): () => void
}

export interface Transport {
  /** Our own peer id. */
  readonly id: string
  /** Connect to a remote peer. Rejects when the peer cannot be reached. */
  connect(remoteId: string): Promise<PeerLink>
  onIncoming(cb: (link: PeerLink) => void): () => void
  onError(cb: (error: Error) => void): () => void
  destroy(): void
}

export interface TransportOptions {
  /** Preferred peer id (host resume). A random id is generated when omitted. */
  id?: string
}

export type TransportFactory = (opts?: TransportOptions) => Promise<Transport>

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** 24 characters from a 32-symbol alphabet: 120 bits, unguessable, and free of look-alike glyphs. */
export function randomPeerId(length = 24): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

export class Emitter<T> {
  private listeners = new Set<(v: T) => void>()
  on(cb: (v: T) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  emit(v: T) {
    for (const l of [...this.listeners]) l(v)
  }
  clear() {
    this.listeners.clear()
  }
}
