import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { CollabSession, toBytes } from './session'
import { createFakeTransport } from './fakeTransport'

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const user = (name: string) => ({ name, color: '#000', colorLight: '#0005' })

async function hostAndGuests(source: string, guests: number) {
  const host = new CollabSession({
    role: 'host',
    transportFactory: createFakeTransport,
    user: user('Host'),
    source,
    theme: 'zinc-dark',
    title: 'Design review',
  })
  const id = await host.host()
  const gs: CollabSession[] = []
  for (let i = 0; i < guests; i++) {
    const g = new CollabSession({
      role: 'guest',
      transportFactory: createFakeTransport,
      user: user(`Guest ${i + 1}`),
      sessionId: id,
    })
    await g.join()
    gs.push(g)
  }
  await tick(50)
  return { host, guests: gs, id }
}

const all: CollabSession[] = []
afterEach(() => {
  for (const s of all.splice(0)) s.destroy()
})

describe('CollabSession', () => {
  it('syncs the initial document, theme and title to a joining guest', async () => {
    const { host, guests } = await hostAndGuests('graph TD\n  A --> B\n', 1)
    all.push(host, ...guests)
    const [g] = guests
    expect(g.status).toBe('connected')
    expect(g.ytext.toString()).toBe('graph TD\n  A --> B\n')
    expect(g.ymeta.get('theme')).toBe('zinc-dark')
    expect(g.ymeta.get('title')).toBe('Design review')
    expect(g.hostUser?.name).toBe('Host')
    expect(
      g
        .participants()
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Guest 1', 'Host'])
  })

  it('merges concurrent edits from host and two guests, relaying through the host', async () => {
    const { host, guests } = await hostAndGuests('start\n', 2)
    all.push(host, ...guests)
    const [g1, g2] = guests
    host.ydoc.transact(
      () => host.ytext.insert(host.ytext.length, 'host line\n'),
      host.ydoc.clientID,
    )
    g1.ydoc.transact(() => g1.ytext.insert(0, 'g1 first\n'), g1.ydoc.clientID)
    g2.ydoc.transact(() => g2.ytext.insert(g2.ytext.length, 'g2 last\n'), g2.ydoc.clientID)
    await tick(80)
    const texts = [host, g1, g2].map((s) => s.ytext.toString())
    expect(new Set(texts).size).toBe(1)
    expect(texts[0]).toContain('host line')
    expect(texts[0]).toContain('g1 first')
    expect(texts[0]).toContain('g2 last')
    // Everyone sees everyone.
    expect(
      g2
        .participants()
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Guest 1', 'Guest 2', 'Host'])
  })

  it("undo only reverts the local user's own changes", async () => {
    const { host, guests } = await hostAndGuests('', 1)
    all.push(host, ...guests)
    const [g] = guests
    host.ydoc.transact(() => host.ytext.insert(0, 'HOST'), host.ydoc.clientID)
    await tick(40)
    g.ydoc.transact(() => g.ytext.insert(g.ytext.length, 'GUEST'), g.ydoc.clientID)
    await tick(40)
    expect(host.ytext.toString()).toBe('HOSTGUEST')
    g.undoManager.undo()
    await tick(40)
    expect(g.ytext.toString()).toBe('HOST')
    expect(host.ytext.toString()).toBe('HOST')
    host.undoManager.undo()
    await tick(40)
    expect(g.ytext.toString()).toBe('')
  })

  it('the shared document carries only source and meta (theme, title)', async () => {
    const { host, guests } = await hostAndGuests('x', 1)
    all.push(host, ...guests)
    const [g] = guests
    const state = Y.encodeStateAsUpdate(g.ydoc)
    const probe = new Y.Doc()
    Y.applyUpdate(probe, state)
    expect([...probe.share.keys()].sort()).toEqual(['meta', 'source'])
    expect([...probe.getMap('meta').keys()].sort()).toEqual(['theme', 'title'])
    probe.destroy()
  })

  it('host can make guests read-only; their updates are dropped and they are told', async () => {
    const { host, guests } = await hostAndGuests('locked\n', 1)
    all.push(host, ...guests)
    const [g] = guests
    const perms: boolean[] = []
    g.permissionChanged.on((v) => perms.push(v))
    host.setCanEdit(false)
    await tick(30)
    expect(perms).toEqual([false])
    expect(g.canEdit).toBe(false)
    g.ydoc.transact(() => g.ytext.insert(0, 'sneaky '), g.ydoc.clientID)
    await tick(40)
    expect(host.ytext.toString()).toBe('locked\n')
  })

  it('ending the session tells guests, who keep their content', async () => {
    const { host, guests } = await hostAndGuests('keep me', 1)
    all.push(host, ...guests)
    const [g] = guests
    const statuses: string[] = []
    g.statusChanged.on((s) => statuses.push(s))
    host.end()
    await tick(40)
    expect(statuses.at(-1)).toBe('ended')
    expect(g.error).toMatch(/host ended/i)
    expect(g.ytext.toString()).toBe('keep me')
  })

  it('a guest cannot join a session nobody hosts', async () => {
    const g = new CollabSession({
      role: 'guest',
      transportFactory: createFakeTransport,
      user: user('Lost'),
      sessionId: 'nobody-home-000000000000',
    })
    all.push(g)
    await expect(g.join()).rejects.toThrow(/reach peer/i)
  })

  it('dropped guests disappear from the participant list', async () => {
    const { host, guests } = await hostAndGuests('x', 2)
    all.push(host, ...guests)
    guests[0].end()
    await tick(40)
    expect(
      host
        .participants()
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Guest 2', 'Host'])
  })
})

describe('toBytes', () => {
  it('accepts every shape a transport may deliver', () => {
    const src = new Uint8Array([1, 2, 3])
    expect(toBytes(src)).toBe(src)
    expect(toBytes(src.buffer.slice(0))).toEqual(src)
    expect(toBytes(new DataView(src.buffer.slice(0)))).toEqual(src)
    expect(toBytes([1, 2, 3])).toEqual(src)
    expect(toBytes({ 0: 1, 1: 2, 2: 3 })).toEqual(src)
    expect(() => toBytes('nope')).toThrow(/Malformed/)
  })
})
