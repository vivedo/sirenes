import type { MermaidTheme, ShareState } from '../store/types'
import { MERMAID_THEMES } from '../store/types'
import { fromBase64Url, toBase64Url } from './base64url'

/**
 * Fragment formats:
 *   #pako:<base64url>   zlib-deflated JSON. Same shape and compression as mermaid.live, so links
 *                       interoperate in both directions.
 *   #base64:<base64url> plain JSON, used only when CompressionStream is unavailable.
 *
 * Payload (mermaid.live compatible): { code: string, mermaid: string (JSON of config), view?: 'preview' }
 */
export const PAKO_PREFIX = 'pako:'
export const BASE64_PREFIX = 'base64:'

export function supportsCompression(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

type ByteTransform = ReadableWritablePair<Uint8Array, Uint8Array>

export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const transform = new CompressionStream('deflate') as unknown as ByteTransform
  return streamToBytes(bytesToStream(bytes).pipeThrough(transform))
}

export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const transform = new DecompressionStream('deflate') as unknown as ByteTransform
  return streamToBytes(bytesToStream(bytes).pipeThrough(transform))
}

interface WirePayload {
  code: string
  mermaid: string
  view?: 'preview'
  // mermaid.live also sends these; harmless for us and helpful for it.
  autoSync?: boolean
  updateDiagram?: boolean
}

export function serializeState(state: ShareState): string {
  const payload: WirePayload = {
    code: state.code,
    mermaid: JSON.stringify({ theme: state.mermaidTheme }),
    autoSync: true,
    updateDiagram: true,
  }
  if (state.view) payload.view = state.view
  return JSON.stringify(payload)
}

export function deserializeState(json: string): ShareState {
  const raw = JSON.parse(json) as Partial<WirePayload> & { mermaid?: unknown }
  if (typeof raw.code !== 'string') throw new Error('Link payload has no code')

  let theme: MermaidTheme = 'default'
  const config =
    typeof raw.mermaid === 'string'
      ? safeParse(raw.mermaid)
      : typeof raw.mermaid === 'object' && raw.mermaid
        ? raw.mermaid
        : null
  const t = (config as { theme?: unknown } | null)?.theme
  if (typeof t === 'string' && (MERMAID_THEMES as readonly string[]).includes(t))
    theme = t as MermaidTheme

  const state: ShareState = { code: raw.code, mermaidTheme: theme }
  if (raw.view === 'preview') state.view = 'preview'
  return state
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** Encode to a fragment string without the leading '#'. */
export async function encodeState(state: ShareState): Promise<string> {
  const bytes = new TextEncoder().encode(serializeState(state))
  if (!supportsCompression()) return BASE64_PREFIX + toBase64Url(bytes)
  return PAKO_PREFIX + toBase64Url(await deflate(bytes))
}

/** Decode a fragment (with or without the leading '#'). Throws on anything malformed. */
export async function decodeState(fragment: string): Promise<ShareState> {
  const frag = fragment.startsWith('#') ? fragment.slice(1) : fragment
  if (frag.startsWith(PAKO_PREFIX)) {
    if (!supportsCompression()) throw new Error('This browser cannot decompress the link')
    const bytes = await inflate(fromBase64Url(frag.slice(PAKO_PREFIX.length)))
    return deserializeState(new TextDecoder().decode(bytes))
  }
  if (frag.startsWith(BASE64_PREFIX)) {
    return deserializeState(
      new TextDecoder().decode(fromBase64Url(frag.slice(BASE64_PREFIX.length))),
    )
  }
  throw new Error('Not a Sirenes link')
}

export function isShareFragment(fragment: string): boolean {
  const frag = fragment.startsWith('#') ? fragment.slice(1) : fragment
  return frag.startsWith(PAKO_PREFIX) || frag.startsWith(BASE64_PREFIX)
}
