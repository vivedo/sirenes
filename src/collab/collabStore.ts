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
    const docStore = useDocumentStore.getState()
    const view = getEditorView()

    // Text flows Y.Doc -> editor (yCollab) -> store (editor update listener). The store never
    // writes text into the editor during a session; see the guard in Editor.tsx. Only the meta
    // map (theme, title) is mirrored here.
    const onMeta = () => {
      const theme = session.ymeta.get('theme')
      if (isThemeId(theme) && useDocumentStore.getState().doc.theme !== theme)
        docStore.setTheme(theme)
      set({ title: session.ymeta.get('title') ?? 'Shared diagram' })
    }
    session.ymeta.observe(onMeta)
    unsubs.push(() => session.ymeta.unobserve(onMeta))

    // Document store -> Y.Doc for the theme (the text goes through the editor binding).
    let prevTheme = useDocumentStore.getState().doc.theme
    unsubs.push(
      useDocumentStore.subscribe((s) => {
        if (s.doc.theme !== prevTheme) {
          prevTheme = s.doc.theme
          if (
            session.ymeta.get('theme') !== s.doc.theme &&
            (session.role === 'host' || session.canEdit)
          )
            session.ydoc.transact(
              () => session.ymeta.set('theme', s.doc.theme),
              session.ydoc.clientID,
            )
        }
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
        // Guests learn the host's name and permissions from the welcome message.
        set({ canEdit, hostName: session.hostUser?.name ?? null })
        const v = getEditorView()
        if (v && session.role === 'guest')
          void import('./editorBinding').then((m) => m.setCollabReadOnly(v, !canEdit))
      }),
    )

    unsubs.push(session.aiPermissionChanged.on((aiEnabled) => set({ aiEnabled })))
    void import('./aiBridge').then((m) => unsubs.push(m.attachAiBridge(session)))

    if (view)
      void import('./editorBinding').then((m) => {
        m.attachCollab(view, session)
        // The editor is the source of truth for text from here on; make the store agree even
        // when the swap was a no-op (e.g. the guest's local text already matched the host's).
        useDocumentStore.getState().setSource(view.state.doc.toString())
      })
    onMeta()
    set({
      participants: session.participants(),
      canEdit: session.canEdit,
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
        // Keep the last synced text (read from the editor, the authority during the session) and
        // give it a fresh single-diagram local identity.
        const d = useDocumentStore.getState().doc
        const source = view ? view.state.doc.toString() : d.source
        useDocumentStore.getState().loadDocument(
          makeDocument({
            ...d,
            source,
            id: newId(),
            fileName: null,
            origin: null,
            savedSource: null,
            diagrams: undefined,
            active: 0,
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
          source: doc.source,
          theme: getTheme(doc.theme).id,
          title: doc.fileName
            ? doc.fileName.replace(/\.(mmd|mermaid|md|markdown|txt)$/i, '')
            : 'Shared diagram',
          sessionId: resumeId,
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
      try {
        sessionStorage.removeItem(HOST_RESUME_KEY)
      } catch {
        /* ignore */
      }
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
