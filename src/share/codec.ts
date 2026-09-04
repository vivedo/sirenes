import type { MermaidTheme, ShareState } from '../store/types'
import { MERMAID_THEMES } from '../store/types'
import { getTheme, isThemeId, type ThemeId } from '../themes/registry'
import type { DocumentState } from '../store/types'
import { newDiagram, type Diagram } from '../documents/multi'
import { fromBase64Url, toBase64Url } from './base64url'

/**
 * Fragment formats:
 *   #pako:<base64url>   zlib-deflated JSON. Same shape and compression as mermaid.live, so links
 *                       interoperate in both directions.
 *   #base64:<base64url> plain JSON, used only when CompressionStream is unavailable.
 *
 * Payload (mermaid.live compatible): { code: string, mermaid: string (JSON of config), view?: 'preview',
 *   sirenes?: { theme: ThemeId } }
 * `mermaid.theme` always holds a Mermaid theme so mermaid.live renders sensibly; `sirenes.theme`
 * carries the full Sirenes theme id (which may be a beautiful-mermaid theme).
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
  sirenes?: {
    theme?: string
    diagrams?: { name: string | null; source: string }[]
    active?: number
  }
  // mermaid.live also sends these; harmless for us and helpful for it.
  autoSync?: boolean
  updateDiagram?: boolean
}

export function serializeState(state: ShareState): string {
  const theme = getTheme(state.theme)
  const payload: WirePayload = {
    code: state.code,
    mermaid: JSON.stringify({ theme: theme.mermaidFallback }),
    autoSync: true,
    updateDiagram: true,
  }
  if (theme.engine !== 'mermaid') payload.sirenes = { theme: theme.id }
  if (state.diagrams && state.diagrams.length > 1) {
    payload.sirenes = {
      ...(payload.sirenes ?? {}),
      diagrams: state.diagrams.map((d) => ({ name: d.name, source: d.source })),
      active: state.active ?? 0,
    }
  }
  if (state.view) payload.view = state.view
  return JSON.stringify(payload)
}

export function deserializeState(json: string): ShareState {
  const raw = JSON.parse(json) as Partial<WirePayload> & { mermaid?: unknown }
  if (typeof raw.code !== 'string') throw new Error('Link payload has no code')

  let theme: ThemeId = 'default'
  const config =
    typeof raw.mermaid === 'string'
      ? safeParse(raw.mermaid)
      : typeof raw.mermaid === 'object' && raw.mermaid
        ? raw.mermaid
        : null
  const t = (config as { theme?: unknown } | null)?.theme
  if (typeof t === 'string' && (MERMAID_THEMES as readonly string[]).includes(t))
    theme = t as MermaidTheme

  // A Sirenes-specific theme overrides the Mermaid fallback.
  if (isThemeId(raw.sirenes?.theme)) theme = raw.sirenes.theme

  const state: ShareState = { code: raw.code, theme }
  if (raw.view === 'preview') state.view = 'preview'
  const ds = raw.sirenes?.diagrams
  if (Array.isArray(ds) && ds.length > 1 && ds.every((d) => d && typeof d.source === 'string')) {
    state.diagrams = ds.map((d) => newDiagram(d.source, typeof d.name === 'string' ? d.name : null))
    const a = raw.sirenes?.active
    state.active = typeof a === 'number' && a >= 0 && a < ds.length ? a : 0
    state.code = state.diagrams[state.active].source
  }
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

/** What to put in a link for a document: the active diagram as `code`, plus all diagrams when there are several. */
export function shareStateOf(doc: DocumentState): ShareState {
  const state: ShareState = { code: doc.source, theme: doc.theme }
  if (doc.diagrams.length > 1) {
    state.diagrams = doc.diagrams as Diagram[]
    state.active = doc.active
  }
  return state
}
