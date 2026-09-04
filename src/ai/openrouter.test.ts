import { describe, expect, it, vi } from 'vitest'
import { OpenRouterError, listModels, streamChat, validateKey } from './openrouter'

function sseResponse(frames: string[], status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      for (const f of frames) c.enqueue(enc.encode(`data: ${f}\n\n`))
      c.close()
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('openrouter client', () => {
  it('validateKey maps the payload', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { label: 'my key', usage: 1.5, limit: null, is_free_tier: false },
          }),
        ),
    ) as unknown as typeof fetch
    const info = await validateKey('sk-or-test', fetchImpl)
    expect(info).toEqual({ label: 'my key', usage: 1.5, limit: null, isFreeTier: false })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://openrouter.ai/api/v1/auth/key')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test')
    expect((init.headers as Record<string, string>)['X-Title']).toBe('Sirenes')
  })

  it('validateKey throws a friendly 401', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: 'bad' } }), {
        status: 401,
      })) as unknown as typeof fetch
    await expect(validateKey('x', fetchImpl)).rejects.toMatchObject({
      status: 401,
      message: /Invalid API key/,
    })
  })

  it('listModels converts per-token prices to per-million and sorts by name', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'z/model',
              name: 'Zed',
              context_length: 128000,
              pricing: { prompt: '0.000003', completion: '0.000015' },
            },
            {
              id: 'a/model',
              name: 'Alpha',
              context_length: null,
              pricing: { prompt: '0', completion: '0' },
            },
          ],
        }),
      )) as unknown as typeof fetch
    const models = await listModels(fetchImpl)
    expect(models.map((m) => m.id)).toEqual(['a/model', 'z/model'])
    expect(models[1].promptPrice).toBeCloseTo(3)
    expect(models[1].completionPrice).toBeCloseTo(15)
    expect(models[0].promptPrice).toBe(0)
  })

  it('streamChat accumulates deltas, reports usage, and stops at [DONE]', async () => {
    const frames = [
      JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'lo' }, finish_reason: null }] }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0001 },
      }),
      '[DONE]',
      JSON.stringify({ choices: [{ delta: { content: 'IGNORED' } }] }),
    ]
    const deltas: string[] = []
    const result = await streamChat({
      key: 'k',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (d) => deltas.push(d),
      fetchImpl: (async () => sseResponse(frames)) as unknown as typeof fetch,
    })
    expect(result.content).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2, cost: 0.0001 })
    expect(result.finishReason).toBe('stop')
  })

  it('streamChat sends stream + usage flags', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string)
      return sseResponse(['[DONE]'])
    }) as unknown as typeof fetch
    await streamChat({ key: 'k', model: 'm', messages: [], fetchImpl })
    expect(body.stream).toBe(true)
    expect(body.usage).toEqual({ include: true })
    expect(body.model).toBe('m')
  })

  it('streamChat surfaces mid-stream errors', async () => {
    const frames = [JSON.stringify({ error: { message: 'Provider exploded', code: 502 } })]
    await expect(
      streamChat({
        key: 'k',
        model: 'm',
        messages: [],
        fetchImpl: (async () => sseResponse(frames)) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(OpenRouterError)
  })

  it('streamChat maps 402 to insufficient credits', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 402 })) as unknown as typeof fetch
    await expect(streamChat({ key: 'k', model: 'm', messages: [], fetchImpl })).rejects.toThrow(
      /credits/,
    )
  })
})
