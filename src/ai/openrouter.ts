import { parseSse } from './sse'

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

export interface ModelInfo {
  id: string
  name: string
  contextLength: number | null
  /** USD per 1M tokens, null when unknown or free. */
  promptPrice: number | null
  completionPrice: number | null
}

export interface KeyInfo {
  label: string
  usage: number
  limit: number | null
  isFreeTier: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Usage {
  promptTokens: number
  completionTokens: number
  /** USD, when OpenRouter reports it. */
  cost: number | null
}

export interface ChatResult {
  content: string
  usage: Usage | null
  finishReason: string | null
}

export class OpenRouterError extends Error {
  status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'OpenRouterError'
    this.status = status
  }
}

function appHeaders(): Record<string, string> {
  const referer =
    import.meta.env.VITE_APP_URL || (typeof location !== 'undefined' ? location.origin : '')
  return { 'HTTP-Referer': referer, 'X-Title': 'Sirenes' }
}

async function errorFromResponse(res: Response): Promise<OpenRouterError> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    detail = body.error?.message ?? ''
  } catch {
    /* no body */
  }
  const friendly: Record<number, string> = {
    401: 'Invalid API key.',
    402: 'Insufficient credits on this OpenRouter key.',
    403: 'This key is not allowed to use that model.',
    404: 'Model not found.',
    408: 'The model timed out.',
    429: 'Rate limited. Try again in a moment.',
    502: 'The model provider returned an error.',
    503: 'No provider is available for this model right now.',
  }
  const base = friendly[res.status] ?? `OpenRouter request failed (${res.status}).`
  return new OpenRouterError(detail ? `${base} ${detail}` : base, res.status)
}

export async function validateKey(key: string, fetchImpl: typeof fetch = fetch): Promise<KeyInfo> {
  const res = await fetchImpl(`${OPENROUTER_BASE}/auth/key`, {
    headers: { Authorization: `Bearer ${key}`, ...appHeaders() },
  })
  if (!res.ok) throw await errorFromResponse(res)
  const { data } = (await res.json()) as {
    data: { label?: string; usage?: number; limit?: number | null; is_free_tier?: boolean }
  }
  return {
    label: data.label ?? 'OpenRouter key',
    usage: data.usage ?? 0,
    limit: data.limit ?? null,
    isFreeTier: Boolean(data.is_free_tier),
  }
}

export async function listModels(fetchImpl: typeof fetch = fetch): Promise<ModelInfo[]> {
  const res = await fetchImpl(`${OPENROUTER_BASE}/models`, { headers: appHeaders() })
  if (!res.ok) throw await errorFromResponse(res)
  const { data } = (await res.json()) as {
    data: {
      id: string
      name?: string
      context_length?: number | null
      pricing?: { prompt?: string | number; completion?: string | number }
    }[]
  }
  return data
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length ?? null,
      promptPrice: perMillion(m.pricing?.prompt),
      completionPrice: perMillion(m.pricing?.completion),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** OpenRouter prices are USD per token as strings; convert to USD per 1M tokens. */
function perMillion(v: string | number | undefined): number | null {
  if (v === undefined || v === null) return null
  const n = typeof v === 'string' ? Number(v) : v
  if (!Number.isFinite(n) || n < 0) return null
  return n * 1_000_000
}

export interface StreamChatOptions {
  key: string
  model: string
  messages: ChatMessage[]
  signal?: AbortSignal
  onDelta?: (text: string) => void
  fetchImpl?: typeof fetch
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  error?: { message?: string; code?: number }
}

/** Stream a chat completion. Resolves with the full text once the stream ends. */
export async function streamChat(opts: StreamChatOptions): Promise<ChatResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const res = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${opts.key}`,
      'Content-Type': 'application/json',
      ...appHeaders(),
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      usage: { include: true },
    }),
  })
  if (!res.ok) throw await errorFromResponse(res)
  if (!res.body) throw new OpenRouterError('Empty response body.', null)

  let content = ''
  let usage: Usage | null = null
  let finishReason: string | null = null

  for await (const data of parseSse(res.body)) {
    if (data === '[DONE]') break
    let chunk: StreamChunk
    try {
      chunk = JSON.parse(data) as StreamChunk
    } catch {
      continue // partial or malformed frame; skip
    }
    if (chunk.error)
      throw new OpenRouterError(chunk.error.message ?? 'Model error', chunk.error.code ?? null)
    const choice = chunk.choices?.[0]
    const delta = choice?.delta?.content
    if (delta) {
      content += delta
      opts.onDelta?.(delta)
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens ?? 0,
        completionTokens: chunk.usage.completion_tokens ?? 0,
        cost: typeof chunk.usage.cost === 'number' ? chunk.usage.cost : null,
      }
    }
  }
  return { content, usage, finishReason }
}
