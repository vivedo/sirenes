import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { renderAscii, renderDiagram } from './renderer'

const RENDER_DEBOUNCE_MS = 250

/**
 * Subscribes to source, theme and preview mode and keeps the render slice of the store up to date.
 * Mount once, near the root.
 */
export function useMermaidRender() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let generation = 0

    const run = async () => {
      const gen = ++generation
      const { doc } = useDocumentStore.getState()
      const { previewMode, asciiPlain } = useSettingsStore.getState()
      useDocumentStore.getState().setRenderResult({ rendering: true })

      const [outcome, text] = await Promise.all([
        renderDiagram(doc.source, doc.theme),
        previewMode === 'ascii' ? renderAscii(doc.source, asciiPlain) : null,
      ])
      if (gen !== generation) return // superseded by a newer edit

      const store = useDocumentStore.getState()
      store.setRenderResult({
        rendering: false,
        error: outcome.error,
        // Keep the previous SVG while the new source is invalid, clear it for an empty document.
        svg: outcome.error ? store.render.svg : outcome.svg,
        engine: outcome.error ? store.render.engine : outcome.engine,
        fallback: outcome.error ? store.render.fallback : outcome.fallback,
        ascii: text ? (outcome.error ? store.render.ascii : text.ascii) : null,
        asciiError: text ? text.error : null,
      })
    }

    const schedule = (immediate = false) => {
      if (timer) clearTimeout(timer)
      if (immediate) void run()
      else timer = setTimeout(() => void run(), RENDER_DEBOUNCE_MS)
    }

    let prevDoc = useDocumentStore.getState().doc
    const unsubDoc = useDocumentStore.subscribe((s) => {
      if (s.doc.source !== prevDoc.source || s.doc.theme !== prevDoc.theme) {
        const themeOnly = s.doc.source === prevDoc.source
        prevDoc = s.doc
        schedule(themeOnly)
      }
    })
    let prevSettings = useSettingsStore.getState()
    const unsubSettings = useSettingsStore.subscribe((s) => {
      if (s.previewMode !== prevSettings.previewMode || s.asciiPlain !== prevSettings.asciiPlain) {
        prevSettings = s
        schedule(true)
      }
    })
    schedule(true)

    return () => {
      unsubDoc()
      unsubSettings()
      if (timer) clearTimeout(timer)
      generation++
    }
  }, [])
}
