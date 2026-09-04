import { describe, expect, it } from 'vitest'
import { randomPeerId } from './transport'
import { createFakeTransport } from './fakeTransport'

describe('transport', () => {
  it('generates long unambiguous ids', () => {
    const id = randomPeerId()
    expect(id).toHaveLength(24)
    expect(id).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]+$/)
    expect(randomPeerId()).not.toBe(id)
  })

  it('fake transport delivers messages both ways and reports closes', async () => {
    const a = await createFakeTransport()
    const b = await createFakeTransport()
    const got: unknown[] = []
    const incoming = new Promise<void>((resolve) =>
      b.onIncoming((link) => {
        link.onMessage((m) => {
          got.push(m)
          link.send({ echo: m })
        })
        resolve()
      }),
    )
    const link = await a.connect(b.id)
    await incoming
    const replies: unknown[] = []
    link.onMessage((m) => replies.push(m))
    let closed = false
    link.onClose(() => (closed = true))
    link.send({ hello: 1, bytes: new Uint8Array([1, 2, 3]) })
    await new Promise((r) => setTimeout(r, 20))
    // Bytes cross a structured-clone boundary; compare their contents, not their realm.
    const plain = (m: unknown) =>
      JSON.parse(
        JSON.stringify(m, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v)),
      )
    expect(got.map(plain)).toEqual([{ hello: 1, bytes: [1, 2, 3] }])
    expect(replies.map(plain)).toEqual([{ echo: { hello: 1, bytes: [1, 2, 3] } }])
    b.destroy()
    await new Promise((r) => setTimeout(r, 20))
    expect(closed).toBe(true)
    a.destroy()
  })
})
