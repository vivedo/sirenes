import { useCallback, useEffect, useState } from 'react'
import { Editor } from '../editor/Editor'
import { DiagramTabs } from './DiagramTabs'
import { Preview } from '../preview/Preview'
import { useMermaidRender } from '../preview/useMermaidRender'
import { useDocumentStore, selectIsDirty } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { watchUiTheme } from '../settings/uiTheme'
import { startAutosave } from '../documents/autosave'
import { useUrlSync } from '../share/useUrlSync'
import { Toolbar } from './Toolbar'
import { StatusBar } from './StatusBar'
import { SplitPane } from './SplitPane'
import { AiPanel } from '../ai/AiPanel'
import { useAiStore } from '../ai/aiStore'
import { ShortcutsDialog } from './ShortcutsDialog'
import { ConflictDialog } from './ConflictDialog'
import { Toasts } from './Toasts'
import { DropZone } from './DropZone'
import { ChoiceDialog } from './ChoiceDialog'
import { DriveBanner } from './DriveBanner'
import { PrivacyDialog } from '../settings/PrivacyDialog'
import { WelcomeDialog } from './WelcomeDialog'
import { hasBeenWelcomed } from './welcome'
import { readFragment } from '../share/urlState'
import { useIsMobile } from '../shared/useMediaQuery'
import { MobileToolbar } from './mobile/MobileToolbar'
import { MobileNav } from './mobile/MobileNav'
import { useMobileStore } from './mobile/mobileStore'
import './mobile/mobile.css'
import { useCollabStore } from '../collab/collabStore'
import { JoinBanner } from '../collab/JoinBanner'
import { LivePanel } from '../collab/LivePanel'
import { writeFragment } from '../share/urlState'
import '../collab/collab.css'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import './App.css'

export function App() {
  const hydrated = useDocumentStore((s) => s.hydrated)
  const aiPanelOpen = useSettingsStore((s) => s.aiPanelOpen)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const isMobile = useIsMobile()
  const mobilePane = useMobileStore((s) => s.pane)
  const [privacyOpen, setPrivacyOpen] = useState(location.hash === '#privacy')
  // First visit only, and never for people arriving through a live-session link.
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => !hasBeenWelcomed() && !readFragment().startsWith('live:') && location.hash !== '#privacy',
  )
  const showShortcuts = useCallback(() => setShortcutsOpen(true), [])

  useMermaidRender()
  useUrlSync()
  useKeyboardShortcuts(showShortcuts)

  useEffect(() => useAiStore.getState().loadKeyFromStorage(), [])

  // Join a #live: link once the editor exists; keep the address bar on the live link while active.
  useEffect(() => {
    if (!hydrated) return
    const pending = useCollabStore.getState().pendingJoin
    if (pending) {
      useCollabStore.getState().setPendingJoin(null)
      void useCollabStore.getState().join(pending)
    }
    return useCollabStore.subscribe((c, prev) => {
      if (
        c.sessionId &&
        c.session &&
        (c.sessionId !== prev.sessionId || c.session !== prev.session)
      )
        writeFragment(`live:${c.sessionId}`)
    })
  }, [hydrated])

  // UI theme follows the setting and the OS.
  useEffect(() => {
    const stop = watchUiTheme(() => useSettingsStore.getState().uiTheme)
    const unsub = useSettingsStore.subscribe((s, prev) => {
      if (s.uiTheme !== prev.uiTheme) watchUiTheme(() => s.uiTheme)()
    })
    return () => {
      stop()
      unsub()
    }
  }, [])

  useEffect(() => (hydrated ? startAutosave() : undefined), [hydrated])

  // Title and unload guard.
  useEffect(() => {
    const update = () => {
      const s = useDocumentStore.getState()
      const name = s.doc.fileName ?? 'Untitled'
      document.title = `${selectIsDirty(s) ? '• ' : ''}${name} — Sirenes`
    }
    update()
    const unsub = useDocumentStore.subscribe(update)
    const onUnload = (e: BeforeUnloadEvent) => {
      if (selectIsDirty(useDocumentStore.getState())) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      unsub()
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  return (
    <div className={`app${aiPanelOpen ? ' with-ai' : ''}`}>
      {isMobile ? (
        <MobileToolbar onShowShortcuts={showShortcuts} onShowPrivacy={() => setPrivacyOpen(true)} />
      ) : (
        <Toolbar onShowShortcuts={showShortcuts} />
      )}
      <DriveBanner />
      <JoinBanner />
      {hydrated && <DiagramTabs />}
      <main className="workspace">
        {hydrated ? (
          <SplitPane
            left={<Editor />}
            right={<Preview />}
            layoutOverride={isMobile ? mobilePane : undefined}
          />
        ) : (
          <div className="booting" />
        )}
        {aiPanelOpen && <AiPanel />}
      </main>
      {isMobile ? <MobileNav /> : <StatusBar onShowPrivacy={() => setPrivacyOpen(true)} />}
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <WelcomeDialog open={welcomeOpen && hydrated} onClose={() => setWelcomeOpen(false)} />
      <ConflictDialog />
      <ChoiceDialog />
      <LivePanel />
      <Toasts />
      <DropZone />
    </div>
  )
}
