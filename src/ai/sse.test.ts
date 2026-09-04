import { describe, expect, it } from 'vitest'
import { parseSse } from './sse'

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
}

async function collect(s: ReadableStream<Uint8Array>) {
  const out: string[] = []
  for await (const d of parseSse(s)) out.push(d)
  return out
}

describe('parseSse', () => {
  it('yields data payloads and skips comments and blank lines', async () => {
    const out = await collect(
      stream([': OPENROUTER PROCESSING\n\ndata: {"a":1}\n\ndata: [DONE]\n\n']),
    )
    expect(out).toEqual(['{"a":1}', '[DONE]'])
  })

  it('reassembles frames split across chunks', async () => {
    const out = await collect(stream(['data: {"a"', ':1}\nda', 'ta: {"b":2}\n']))
    expect(out).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('handles CRLF and a trailing frame without newline', async () => {
    const out = await collect(stream(['data: x\r\ndata: y']))
    expect(out).toEqual(['x', 'y'])
  })
})
