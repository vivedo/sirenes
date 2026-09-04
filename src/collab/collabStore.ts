import { create } from 'zustand'
import type { CollabSession, Participant, SessionStatus, SessionUser } from './session'
import type { TransportFactory } from './transport'
import { useDocumentStore, makeDocument } from '../store/documentStore'
import { getTheme, isThemeId } from '../themes/registry'
import { toast } from '../store/toastStore'
import { getEditorView } from '../editor/editorRegistry'
import { newId } from '../shared/id'

export const COLLAB_NAME_KEY = 'sirenes:collab-name'
export const HOST_RESUME_KEY = 'sirenes:collab-host'
export const HOST_STATE_KEY = 'sirenes:collab-host-state'

const PALETTE = [
  '#e06c75',
  '#e5c07b',
  '#98c379',
  '#56b6c2',
  '#61afef',
  '#c678dd',
  '#d19a66',
  '#2aa198',
]

function readName(): string {
  try {
    return localStorage.getItem(COLLAB_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Host's Y.Doc state, saved so a reload resumes with the same history as its guests. */
function readHostState(sessionId: string): Uint8Array | null {
  try {
    const raw = sessionStorage.getItem(HOST_STATE_KEY)
    if (!raw) return null
    const { id, state } = JSON.parse(raw) as { id: string; state: string }
    return id === sessionId ? base64ToBytes(state) : null
  } catch {
    return null
  }
}

function writeHostState(sessionId: string, state: Uint8Array) {
  try {
    sessionStorage.setItem(
      HOST_STATE_KEY,
      JSON.stringify({ id: sessionId, state: bytesToBase64(state) }),
    )
  } catch {
    /* quota or private mode: resume will fall back to the autosaved text */
  }
}

function clearHostState() {
  try {
    sessionStorage.removeItem(HOST_STATE_KEY)
    sessionStorage.removeItem(HOST_RESUME_KEY)
  } catch {
    /* ignore */
  }
}

function pickColor(): { color: string; colorLight: string } {
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]
  return { color, colorLight: color + '55' }
}

interface CollabStore {
  session: CollabSession | null
  role: 'host' | 'guest' | null
  status: SessionStatus | null
  sessionId: string | null
  title: string
  canEdit: boolean
  /** Host: guests may use the host's assistant. Guest: whether the host allows it. */
  aiEnabled: boolean
  hostName: string | null
  participants: Participant[]
  error: string | null
  myName: string
  /** Session id from a #live: link, waiting for hydration. */
  pendingJoin: string | null
  panelOpen: boolean

  setMyName: (name: string) => void
  setPendingJoin: (id: string | null) => void
  setPanelOpen: (open: boolean) => void
  startHosting: (resumeId?: string) => Promise<void>
  join: (sessionId: string) => Promise<void>
  leave: () => void
  setTitle: (title: string) => void
  setCanEdit: (canEdit: boolean) => void
  setAiEnabled: (enabled: boolean) => void
}

/** Which transport to use. The e2e build sets VITE_COLLAB_TRANSPORT=fake. */
async function transportFactory(): Promise<TransportFactory> {
  if (import.meta.env.VITE_COLLAB_TRANSPORT === 'fake') {
    return (await import('./fakeTransport')).createFakeTransport
  }
  return (await import('./peerTransport')).createPeerTransport
}

export const useCollabStore = create<CollabStore>((set, get) => {
  let unsubs: (() => void)[] = []

  const cleanup = () => {
    for (const u of unsubs) u()
    unsubs = []
  }

  const user = (): SessionUser => {
    const name =
      get().myName.trim() ||
      (get().role === 'host' ? 'Host' : `Guest ${Math.floor(Math.random() * 900 + 100)}`)
    return { name, ...pickColor() }
  }

  /** Wire a session into the document store and editor; shared for host and guest. */
  const bind = (session: CollabSession) => {
    // Shared document -> store: mirror the diagram list (names, order, sources of inactive
    // diagrams) and the meta map. The active diagram's text flows through the editor binding.
    const reconcile = () => {
      const docStore = useDocumentStore.getState()
      const doc = docStore.doc
      const shared = session.diagrams()
      if (!shared.length) return
      const activeId = doc.diagrams[doc.active]?.id
      let active = shared.findIndex((d) => d.id === activeId)
      if (active === -1) active = Math.min(doc.active, shared.length - 1)
      const view = getEditorView()
      const next = shared.map((d, i) =>
        i === active && view ? { ...d, source: view.state.doc.toString() } : d,
      )
      const same =
        next.length === doc.diagrams.length &&
        next.every((d, i) => {
          const o = doc.diagrams[i]
          return o.id === d.id && o.name === d.name && o.source === d.source
        }) &&
        active === doc.active
      if (!same)
        docStore.loadDocument({ ...doc, diagrams: next, active, source: next[active].source })
      const theme = session.ymeta.get('theme')
      if (isThemeId(theme) && useDocumentStore.getState().doc.theme !== theme)
        docStore.setTheme(theme)
      set({ title: session.ymeta.get('title') ?? 'Shared diagram' })
    }
    session.ydiagrams.observeDeep(reconcile)
    session.ymeta.observe(reconcile)
    unsubs.push(
      () => session.ydiagrams.unobserveDeep(reconcile),
      () => session.ymeta.unobserve(reconcile),
    )

    // Editor <-> active diagram: (re)bind whenever the active diagram changes.
    let boundId: string | null = null
    const rebind = () => {
      const view = getEditorView()
      if (!view) return
      const { doc } = useDocumentStore.getState()
      const id = doc.diagrams[doc.active]?.id
      if (!id || id === boundId) return
      void import('./editorBinding').then((m) => {
        if (m.attachCollab(view, session, id)) {
          boundId = id
          useDocumentStore.getState().setSource(view.state.doc.toString())
        }
      })
    }
    unsubs.push(
      useDocumentStore.subscribe((s, prev) => {
        if (s.doc.active !== prev.doc.active || s.doc.diagrams !== prev.doc.diagrams) rebind()
        if (s.doc.theme !== prev.doc.theme && session.ymeta.get('theme') !== s.doc.theme)
          session.setTheme(s.doc.theme)
      }),
    )

    unsubs.push(
      session.statusChanged.on((status) => {
        set({ status, error: session.error })
        if (status === 'ended' || status === 'failed') finishLocally(session)
      }),
      session.participantsChanged.on((participants) =>
        set({ participants, hostName: session.hostUser?.name ?? null }),
      ),
      session.permissionChanged.on((canEdit) => {
        set({ canEdit, hostName: session.hostUser?.name ?? null })
        const v = getEditorView()
        if (v && session.role === 'guest')
          void import('./editorBinding').then((m) => m.setCollabReadOnly(v, !canEdit))
      }),
      session.aiPermissionChanged.on((aiEnabled) => set({ aiEnabled })),
    )
    void import('./aiBridge').then((m) => unsubs.push(m.attachAiBridge(session)))

    reconcile()
    rebind()
    set({
      participants: session.participants(),
      canEdit: session.canEdit,
      aiEnabled: session.aiEnabled,
      hostName: session.hostUser?.name ?? null,
    })
  }

  /** Session is over: detach the editor and continue as an ordinary local document. */
  const finishLocally = (session: CollabSession) => {
    cleanup()
    const view = getEditorView()
    const finish = () => {
      session.destroy()
      const wasGuest = session.role === 'guest'
      const reason = session.error
      set({
        session: null,
        role: null,
        status: null,
        sessionId: null,
        participants: [],
        hostName: null,
        error: null,
        canEdit: true,
        aiEnabled: true,
      })
      if (wasGuest) {
        // Keep every diagram as last synced and give the file a fresh local identity.
        const d = useDocumentStore.getState().doc
        const diagrams = session.diagrams()
        const active = Math.min(d.active, Math.max(0, diagrams.length - 1))
        useDocumentStore.getState().loadDocument(
          makeDocument({
            ...d,
            source: diagrams[active]?.source ?? d.source,
            diagrams: diagrams.length ? diagrams : undefined,
            active,
            id: newId(),
            fileName: null,
            origin: null,
            savedSource: null,
          }),
        )
        toast.info(`${reason ?? 'Left the session.'} You keep a local copy of the diagram.`)
      }
    }
    unsubs.push(session.aiPermissionChanged.on((aiEnabled) => set({ aiEnabled })))
    void import('./aiBridge').then((m) => unsubs.push(m.attachAiBridge(session)))

    if (view)
      void import('./editorBinding').then((m) => {
        m.detachCollab(view)
        finish()
      })
    else finish()
  }

  return {
    session: null,
    role: null,
    status: null,
    sessionId: null,
    title: 'Shared diagram',
    canEdit: true,
    aiEnabled: true,
    hostName: null,
    participants: [],
    error: null,
    myName: readName(),
    pendingJoin: null,
    panelOpen: false,

    setMyName: (myName) => {
      set({ myName })
      try {
        localStorage.setItem(COLLAB_NAME_KEY, myName)
      } catch {
        /* ignore */
      }
      get().session?.awareness.setLocalStateField('user', {
        ...(get().session!.awareness.getLocalState()?.user as SessionUser),
        name: myName || 'Anonymous',
      })
    },
    setPendingJoin: (pendingJoin) => set({ pendingJoin }),
    setPanelOpen: (panelOpen) => set({ panelOpen }),

    startHosting: async (resumeId) => {
      if (get().session) return
      set({ role: 'host', status: 'connecting', error: null })
      try {
        const [{ CollabSession }, factory] = await Promise.all([
          import('./session'),
          transportFactory(),
        ])
        const { doc } = useDocumentStore.getState()
        const session = new CollabSession({
          role: 'host',
          transportFactory: factory,
          user: user(),
          diagrams: doc.diagrams,
          theme: getTheme(doc.theme).id,
          title: doc.fileName
            ? doc.fileName.replace(/\.(mmd|mermaid|md|markdown|txt)$/i, '')
            : 'Shared diagram',
          sessionId: resumeId,
          initialState: resumeId ? readHostState(resumeId) : null,
        })
        set({ session })
        bind(session)
        const id = await session.host()
        set({ sessionId: id, status: 'connected', panelOpen: true })
        try {
          sessionStorage.setItem(HOST_RESUME_KEY, id)
        } catch {
          /* ignore */
        }
        // Keep the shared history on disk so a reload resumes without duplicating the text.
        let saveTimer: ReturnType<typeof setTimeout> | null = null
        const save = () => {
          if (saveTimer) return
          saveTimer = setTimeout(() => {
            saveTimer = null
            writeHostState(id, session.encodeState())
          }, 250)
        }
        session.ydoc.on('update', save)
        writeHostState(id, session.encodeState())
        unsubs.push(() => {
          session.ydoc.off('update', save)
          if (saveTimer) clearTimeout(saveTimer)
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not start the session'
        cleanup()
        const view = getEditorView()
        if (view) void import('./editorBinding').then((m) => m.detachCollab(view))
        get().session?.destroy()
        set({ session: null, role: null, status: null, error: message })
        toast.error(`Could not start live sharing: ${message}`)
      }
    },

    join: async (sessionId) => {
      if (get().session) return
      set({ role: 'guest', status: 'connecting', error: null, sessionId })
      try {
        const [{ CollabSession }, factory] = await Promise.all([
          import('./session'),
          transportFactory(),
        ])
        const session = new CollabSession({
          role: 'guest',
          transportFactory: factory,
          user: user(),
          sessionId,
        })
        set({ session })
        // A guest starts from an empty document that the host's state fills in.
        useDocumentStore.getState().newDocument({ source: '' })
        bind(session)
        await session.join()
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not join the session'
        cleanup()
        const view = getEditorView()
        if (view) void import('./editorBinding').then((m) => m.detachCollab(view))
        get().session?.destroy()
        set({ session: null, role: null, status: 'failed', error: message })
      }
    },

    leave: () => {
      const s = get().session
      if (!s) return
      clearHostState()
      s.end() // statusChanged -> finishLocally
    },

    setTitle: (title) => {
      get().session?.setTitle(title)
      set({ title })
    },
    setCanEdit: (canEdit) => {
      get().session?.setCanEdit(canEdit)
      set({ canEdit })
    },
    setAiEnabled: (aiEnabled) => {
      get().session?.setAiEnabled(aiEnabled)
      set({ aiEnabled })
    },
  }
})

export const selectInSession = (s: CollabStore) => s.session !== null
export const selectIsGuest = (s: CollabStore) => s.role === 'guest' && s.session !== null

// Test builds expose the store so end-to-end tests can inspect session state.
if (import.meta.env.VITE_COLLAB_TRANSPORT === 'fake' && typeof window !== 'undefined') {
  ;(window as unknown as { __collab: typeof useCollabStore }).__collab = useCollabStore
}
