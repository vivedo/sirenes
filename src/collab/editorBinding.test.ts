import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CollabSession } from './session'
import { createFakeTransport } from './fakeTransport'
import { attachCollab } from './editorBinding'
import { newDiagram } from '../documents/multi'
import { collabCompartment, historyCompartment, readOnlyCompartment } from '../editor/compartments'

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const user = (name: string) => ({ name, color: '#000', colorLight: '#0005' })

function makeView(doc: string) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [historyCompartment.of([]), collabCompartment.of([]), readOnlyCompartment.of([])],
    }),
  })
}

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const c of cleanup.splice(0)) c()
})

describe('editor binding', () => {
  it('keeps two bound editors converged without runaway growth', async () => {
    const source = 'flowchart TD\n    A --> B\n'
    const host = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('H'),
      diagrams: [newDiagram(source, null, 'd1')],
      theme: 'default',
    })
    const id = await host.host()
    const guest = new CollabSession({
      role: 'guest',
      transportFactory: createFakeTransport,
      user: user('G'),
      sessionId: id,
    })
    const hostView = makeView(source)
    const guestView = makeView('')
    cleanup.push(() => {
      hostView.destroy()
      guestView.destroy()
      host.destroy()
      guest.destroy()
    })

    attachCollab(hostView, host, 'd1')
    await guest.join()
    await tick(60)
    expect(attachCollab(guestView, guest, 'd1')).toBe(true)
    await tick(20)
    expect(guestView.state.doc.toString()).toBe(source)

    // Guest types two characters at the end.
    const end = guestView.state.doc.length
    guestView.dispatch({ changes: { from: end, insert: '\n' }, userEvent: 'input.type' })
    guestView.dispatch({ changes: { from: end + 1, insert: 'X' }, userEvent: 'input.type' })
    await tick(150)

    const expected = source + '\nX'
    expect(guest.textFor('d1')!.toString()).toBe(expected)
    expect(guestView.state.doc.toString()).toBe(expected)
    expect(host.textFor('d1')!.toString()).toBe(expected)
    expect(hostView.state.doc.toString()).toBe(expected)

    // Host types back.
    hostView.dispatch({
      changes: { from: hostView.state.doc.length, insert: 'Y' },
      userEvent: 'input.type',
    })
    await tick(150)
    expect(guestView.state.doc.toString()).toBe(expected + 'Y')
    expect(host.textFor('d1')!.toString().length).toBe(expected.length + 1)
  })
})

describe('rebinding between diagrams', () => {
  it('switching the editor to another diagram never writes into the previous one', async () => {
    const host = new CollabSession({
      role: 'host',
      transportFactory: createFakeTransport,
      user: user('H'),
      diagrams: [newDiagram('graph TD\n  first\n', 'One', 'd1'), newDiagram('', 'Two', 'd2')],
      theme: 'default',
    })
    await host.host()
    const view = makeView('')
    cleanup.push(() => {
      view.destroy()
      host.destroy()
    })
    expect(attachCollab(view, host, 'd1')).toBe(true)
    expect(view.state.doc.toString()).toBe('graph TD\n  first\n')

    // Rebind to the empty second diagram: the editor is cleared, the first diagram is untouched.
    expect(attachCollab(view, host, 'd2')).toBe(true)
    expect(view.state.doc.toString()).toBe('')
    expect(host.textFor('d1')!.toString()).toBe('graph TD\n  first\n')

    // Typing now lands in the second diagram only.
    view.dispatch({ changes: { from: 0, insert: 'pie' }, userEvent: 'input.type' })
    await tick(30)
    expect(host.textFor('d2')!.toString()).toBe('pie')
    expect(host.textFor('d1')!.toString()).toBe('graph TD\n  first\n')

    // And back again.
    expect(attachCollab(view, host, 'd1')).toBe(true)
    expect(view.state.doc.toString()).toBe('graph TD\n  first\n')
    expect(host.textFor('d2')!.toString()).toBe('pie')
  })
})
