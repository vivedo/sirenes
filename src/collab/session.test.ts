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

describe('shared AI protocol', () => {
  it('forwards guest requests to the host and mirrors host state to guests', async () => {
    const { host, guests } = await hostAndGuests('graph TD', 1)
    all.push(host, ...guests)
    const [g] = guests
    const requests: unknown[] = []
    host.aiRequested.on((r) => requests.push(r))
    const states: unknown[] = []
    g.aiStateChanged.on((s) => states.push(s))

    g.sendAiRequest({ id: 'r1', text: 'add a node', mode: 'edit', author: 'Grace' })
    await tick(30)
    expect(requests).toEqual([{ id: 'r1', text: 'add a node', mode: 'edit', author: 'Grace' }])

    host.publishAiState({
      enabled: true,
      hasKey: true,
      model: 'm',
      streaming: true,
      messages: [{ id: 'a' }],
    })
    await tick(30)
    expect(states).toHaveLength(1)
    expect(g.aiState?.streaming).toBe(true)
  })

  it('late joiners receive the current AI state with the welcome', async () => {
    const host = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      source: 'x',
    })
    all.push(host)
    const id = await host.host()
    host.publishAiState({
      enabled: true,
      hasKey: true,
      model: 'm',
      streaming: false,
      messages: [{ id: 'old' }],
    })
    const g = new CollabSession({
      role: 'guest',
      transportFactory: createFakeTransport,
      user: user('Late'),
      sessionId: id,
    })
    all.push(g)
    await g.join()
    await tick(40)
    expect(g.aiState?.messages).toEqual([{ id: 'old' }])
  })

  it('host can disable the shared assistant; guest requests are then ignored', async () => {
    const { host, guests } = await hostAndGuests('graph TD', 1)
    all.push(host, ...guests)
    const [g] = guests
    const perms: boolean[] = []
    g.aiPermissionChanged.on((v) => perms.push(v))
    const requests: unknown[] = []
    host.aiRequested.on((r) => requests.push(r))
    host.setAiEnabled(false)
    await tick(30)
    expect(perms).toEqual([false])
    expect(g.aiEnabled).toBe(false)
    // Even a misbehaving guest that sends anyway is ignored by the host.
    g.aiEnabled = true
    g.sendAiRequest({ id: 'r2', text: 'sneaky', mode: 'edit', author: 'G' })
    await tick(30)
    expect(requests).toEqual([])
  })

  it('apply requests respect the edit permission; reject does not need it', async () => {
    const { host, guests } = await hostAndGuests('graph TD', 1)
    all.push(host, ...guests)
    const [g] = guests
    const applies: unknown[] = []
    const rejects: unknown[] = []
    host.aiApplyRequested.on((a) => applies.push(a))
    host.aiRejectRequested.on((r) => rejects.push(r))
    host.setCanEdit(false)
    await tick(30)
    g.sendAiApply('m1', 'G')
    g.sendAiReject('m2')
    await tick(30)
    expect(applies).toEqual([])
    expect(rejects).toEqual([{ messageId: 'm2' }])
    host.setCanEdit(true)
    await tick(30)
    g.sendAiApply('m1', 'G')
    await tick(30)
    expect(applies).toEqual([{ messageId: 'm1', author: 'G' }])
  })
})

describe('host resume', () => {
  it('a host that restores its saved state re-syncs with guests without duplicating text', async () => {
    const host1 = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      source: 'graph TD\n  A --> B\n',
    })
    const id = await host1.host()
    const guest = new CollabSession({
      role: 'guest',
      transportFactory: createFakeTransport,
      user: user('G'),
      sessionId: id,
      reconnectIntervalMs: 30,
    })
    all.push(guest)
    await guest.join()
    await tick(40)
    guest.ydoc.transact(
      () => guest.ytext.insert(guest.ytext.length, '  B --> C\n'),
      guest.ydoc.clientID,
    )
    await tick(40)
    const saved = host1.encodeState()
    const textBefore = host1.ytext.toString()
    expect(textBefore).toBe('graph TD\n  A --> B\n  B --> C\n')

    // "Reload": the host page vanishes without saying goodbye, then comes back under the same id
    // with its saved state.
    ;(host1 as unknown as { transport: { destroy(): void } }).transport.destroy()
    await tick(40)
    expect(guest.status).toBe('reconnecting')
    const host2 = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      source: 'IGNORED',
      sessionId: id,
      initialState: saved,
    })
    all.push(host2)
    await host2.host()
    // The guest's first retry may have timed out against the dead host; allow a second one.
    await tick(700)
    expect(guest.status).toBe('connected')
    expect(host2.ytext.toString()).toBe(textBefore)
    expect(guest.ytext.toString()).toBe(textBefore)

    // Edits keep flowing both ways afterwards.
    host2.ydoc.transact(() => host2.ytext.insert(host2.ytext.length, 'X'), host2.ydoc.clientID)
    await tick(40)
    expect(guest.ytext.toString()).toBe(textBefore + 'X')
  })

  it('without saved state the resumed host falls back to the autosaved text (documents the duplication risk)', async () => {
    const host = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      source: 'graph TD\n',
      sessionId: undefined,
      initialState: null,
    })
    all.push(host)
    await host.host()
    expect(host.ytext.toString()).toBe('graph TD\n')
  })
})
