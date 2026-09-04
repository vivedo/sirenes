import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { CollabSession, toBytes } from './session'
import { createFakeTransport } from './fakeTransport'
import { newDiagram, type Diagram } from '../documents/multi'

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const user = (name: string) => ({ name, color: '#000', colorLight: '#0005' })
const one = (source: string): Diagram[] => [newDiagram(source, null, 'd1')]

async function hostAndGuests(diagrams: Diagram[], guests: number) {
  const host = new CollabSession({
    role: 'host',
    transportFactory: createFakeTransport,
    user: user('Host'),
    diagrams,
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
const text = (s: CollabSession, id = 'd1') => s.textFor(id)!.toString()
const edit = (s: CollabSession, id: string, fn: (t: Y.Text) => void) =>
  s.ydoc.transact(() => fn(s.textFor(id)!), s.ydoc.clientID)

describe('CollabSession', () => {
  it('syncs every diagram, the theme and the title to a joining guest', async () => {
    const diagrams = [
      newDiagram('graph TD\n  A --> B\n', 'Login', 'a'),
      newDiagram('pie\n', 'Pay', 'b'),
    ]
    const { host, guests } = await hostAndGuests(diagrams, 1)
    all.push(host, ...guests)
    const [g] = guests
    expect(g.status).toBe('connected')
    expect(g.diagrams()).toEqual(diagrams)
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
    const { host, guests } = await hostAndGuests(one('start\n'), 2)
    all.push(host, ...guests)
    const [g1, g2] = guests
    edit(host, 'd1', (t) => t.insert(t.length, 'host line\n'))
    edit(g1, 'd1', (t) => t.insert(0, 'g1 first\n'))
    edit(g2, 'd1', (t) => t.insert(t.length, 'g2 last\n'))
    await tick(80)
    const texts = [host, g1, g2].map((s) => text(s))
    expect(new Set(texts).size).toBe(1)
    expect(texts[0]).toContain('host line')
    expect(texts[0]).toContain('g1 first')
    expect(texts[0]).toContain('g2 last')
    expect(
      g2
        .participants()
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Guest 1', 'Guest 2', 'Host'])
  })

  it('guests can add, rename and remove diagrams; everyone sees the list', async () => {
    const { host, guests } = await hostAndGuests(one('graph TD\n'), 1)
    all.push(host, ...guests)
    const [g] = guests
    const id = g.addDiagram('pie\n', 'Costs')!
    await tick(40)
    expect(host.diagrams().map((d) => d.name)).toEqual([null, 'Costs'])
    expect(host.textFor(id)?.toString()).toBe('pie\n')
    g.renameDiagram(id, 'Budget')
    edit(host, id, (t) => t.insert(t.length, '  "a": 1\n'))
    await tick(40)
    expect(g.diagrams()[1]).toEqual({ id, name: 'Budget', source: 'pie\n  "a": 1\n' })
    const removed = g.removeDiagram(id)
    expect(removed?.name).toBe('Budget')
    await tick(40)
    expect(host.diagrams()).toHaveLength(1)
    expect(g.removeDiagram('d1')).toBeNull() // never the last one
  })

  it('undo is per participant and per diagram', async () => {
    const { host, guests } = await hostAndGuests(one(''), 1)
    all.push(host, ...guests)
    const [g] = guests
    edit(host, 'd1', (t) => t.insert(0, 'HOST'))
    await tick(40)
    edit(g, 'd1', (t) => t.insert(t.length, 'GUEST'))
    await tick(40)
    expect(text(host)).toBe('HOSTGUEST')
    g.undoManagerFor('d1')!.undo()
    await tick(40)
    expect(text(g)).toBe('HOST')
    expect(text(host)).toBe('HOST')
    host.undoManagerFor('d1')!.undo()
    await tick(40)
    expect(text(g)).toBe('')
  })

  it('the shared document carries only diagrams and meta (theme, title)', async () => {
    const { host, guests } = await hostAndGuests(one('x'), 1)
    all.push(host, ...guests)
    const probe = new Y.Doc()
    Y.applyUpdate(probe, Y.encodeStateAsUpdate(guests[0].ydoc))
    expect([...probe.share.keys()].sort()).toEqual(['diagrams', 'meta'])
    expect([...probe.getMap('meta').keys()].sort()).toEqual(['theme', 'title'])
    const d = probe.getArray<Y.Map<unknown>>('diagrams').get(0)
    expect([...d.keys()].sort()).toEqual(['id', 'name', 'source'])
    probe.destroy()
  })

  it('presence includes which diagram each participant views', async () => {
    const { host, guests } = await hostAndGuests(
      [newDiagram('a', 'A', 'a'), newDiagram('b', 'B', 'b')],
      1,
    )
    all.push(host, ...guests)
    guests[0].setViewing('b')
    await tick(40)
    expect(host.participants().find((p) => p.name === 'Guest 1')?.diagramId).toBe('b')
  })

  it('host can make guests read-only; their updates are dropped and they are told', async () => {
    const { host, guests } = await hostAndGuests(one('locked\n'), 1)
    all.push(host, ...guests)
    const [g] = guests
    const perms: boolean[] = []
    g.permissionChanged.on((v) => perms.push(v))
    host.setCanEdit(false)
    await tick(30)
    expect(perms).toEqual([false])
    expect(g.canEdit).toBe(false)
    expect(g.addDiagram('x')).toBeNull()
    edit(g, 'd1', (t) => t.insert(0, 'sneaky '))
    await tick(40)
    expect(text(host)).toBe('locked\n')
  })

  it('ending the session tells guests, who keep their content', async () => {
    const { host, guests } = await hostAndGuests(one('keep me'), 1)
    all.push(host, ...guests)
    const [g] = guests
    const statuses: string[] = []
    g.statusChanged.on((s) => statuses.push(s))
    host.end()
    await tick(40)
    expect(statuses.at(-1)).toBe('ended')
    expect(g.error).toMatch(/host ended/i)
    expect(text(g)).toBe('keep me')
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
    const { host, guests } = await hostAndGuests(one('x'), 2)
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
  it('forwards guest requests (with the diagram) to the host and mirrors host state to guests', async () => {
    const { host, guests } = await hostAndGuests(one('graph TD'), 1)
    all.push(host, ...guests)
    const [g] = guests
    const requests: unknown[] = []
    host.aiRequested.on((r) => requests.push(r))
    const states: unknown[] = []
    g.aiStateChanged.on((s) => states.push(s))
    g.sendAiRequest({
      id: 'r1',
      text: 'add a node',
      mode: 'edit',
      author: 'Grace',
      diagramId: 'd1',
    })
    await tick(30)
    expect(requests).toEqual([
      { id: 'r1', text: 'add a node', mode: 'edit', author: 'Grace', diagramId: 'd1' },
    ])
    host.publishAiState({
      enabled: true,
      hasKey: true,
      model: 'm',
      threads: { d1: { messages: [{ id: 'a' }], streaming: true } },
    })
    await tick(30)
    expect(states).toHaveLength(1)
    expect(g.aiState?.threads.d1.streaming).toBe(true)
  })

  it('late joiners receive the current AI state with the welcome', async () => {
    const host = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      diagrams: one('x'),
    })
    all.push(host)
    const id = await host.host()
    host.publishAiState({
      enabled: true,
      hasKey: true,
      model: 'm',
      threads: { d1: { messages: [{ id: 'old' }], streaming: false } },
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
    expect(g.aiState?.threads.d1.messages).toEqual([{ id: 'old' }])
  })

  it('host can disable the shared assistant; guest requests are then ignored', async () => {
    const { host, guests } = await hostAndGuests(one('graph TD'), 1)
    all.push(host, ...guests)
    const [g] = guests
    const perms: boolean[] = []
    g.aiPermissionChanged.on((v) => perms.push(v))
    const requests: unknown[] = []
    host.aiRequested.on((r) => requests.push(r))
    host.setAiEnabled(false)
    await tick(30)
    expect(perms).toEqual([false])
    g.aiEnabled = true
    g.sendAiRequest({ id: 'r2', text: 'sneaky', mode: 'edit', author: 'G', diagramId: 'd1' })
    await tick(30)
    expect(requests).toEqual([])
  })

  it('apply requests respect the edit permission; reject does not need it', async () => {
    const { host, guests } = await hostAndGuests(one('graph TD'), 1)
    all.push(host, ...guests)
    const [g] = guests
    const applies: unknown[] = []
    const rejects: unknown[] = []
    host.aiApplyRequested.on((a) => applies.push(a))
    host.aiRejectRequested.on((r) => rejects.push(r))
    host.setCanEdit(false)
    await tick(30)
    g.sendAiApply('m1', 'G', 'd1')
    g.sendAiReject('m2', 'd1')
    await tick(30)
    expect(applies).toEqual([])
    expect(rejects).toEqual([{ messageId: 'm2', diagramId: 'd1' }])
    host.setCanEdit(true)
    await tick(30)
    g.sendAiApply('m1', 'G', 'd1')
    await tick(30)
    expect(applies).toEqual([{ messageId: 'm1', author: 'G', diagramId: 'd1' }])
  })
})

describe('host resume', () => {
  it('a host that restores its saved state re-syncs with guests without duplicating text', async () => {
    const host1 = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      diagrams: one('graph TD\n  A --> B\n'),
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
    edit(guest, 'd1', (t) => t.insert(t.length, '  B --> C\n'))
    await tick(40)
    const saved = host1.encodeState()
    const textBefore = text(host1)
    expect(textBefore).toBe('graph TD\n  A --> B\n  B --> C\n')
    ;(host1 as unknown as { transport: { destroy(): void } }).transport.destroy()
    await tick(40)
    expect(guest.status).toBe('reconnecting')
    const host2 = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      diagrams: one('IGNORED'),
      sessionId: id,
      initialState: saved,
    })
    all.push(host2)
    await host2.host()
    await tick(700)
    expect(guest.status).toBe('connected')
    expect(text(host2)).toBe(textBefore)
    expect(text(guest)).toBe(textBefore)
    edit(host2, 'd1', (t) => t.insert(t.length, 'X'))
    await tick(40)
    expect(text(guest)).toBe(textBefore + 'X')
  })

  it('without saved state the resumed host starts from the given diagrams', async () => {
    const host = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('Host'),
      diagrams: one('graph TD\n'),
      initialState: null,
    })
    all.push(host)
    await host.host()
    expect(text(host)).toBe('graph TD\n')
  })
})
