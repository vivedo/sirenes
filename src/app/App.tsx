import { useCallback, useEffect, useState } from 'react'
import { Editor } from '../editor/Editor'
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
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import './App.css'

export function App() {
  const hydrated = useDocumentStore((s) => s.hydrated)
  const aiPanelOpen = useSettingsStore((s) => s.aiPanelOpen)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const showShortcuts = useCallback(() => setShortcutsOpen(true), [])

  useMermaidRender()
  useUrlSync()
  useKeyboardShortcuts(showShortcuts)

  useEffect(() => useAiStore.getState().loadKeyFromStorage(), [])

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
      <Toolbar onShowShortcuts={showShortcuts} />
      <main className="workspace">
        {hydrated ? (
          <SplitPane left={<Editor />} right={<Preview />} />
        ) : (
          <div className="booting" />
        )}
        {aiPanelOpen && <AiPanel />}
      </main>
      <StatusBar />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ConflictDialog />
      <Toasts />
      <DropZone />
    </div>
  )
}
