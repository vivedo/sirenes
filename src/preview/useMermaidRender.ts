import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { renderMermaid } from './renderer'

const RENDER_DEBOUNCE_MS = 250

/**
 * Subscribes to source + theme and keeps the render slice of the store up to date.
 * Mount once, near the root.
 */
export function useMermaidRender() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let generation = 0

    const run = async (source: string, theme: Parameters<typeof renderMermaid>[1]) => {
      const gen = ++generation
      useDocumentStore.getState().setRenderResult({ rendering: true })
      const outcome = await renderMermaid(source, theme)
      if (gen !== generation) return // superseded by a newer edit
      const store = useDocumentStore.getState()
      store.setRenderResult({
        rendering: false,
        error: outcome.error,
        // Keep the previous SVG while the new source is invalid, clear it for an empty document.
        svg: outcome.error ? store.render.svg : outcome.svg,
      })
    }

    const schedule = (immediate = false) => {
      const { doc } = useDocumentStore.getState()
      if (timer) clearTimeout(timer)
      if (immediate) void run(doc.source, doc.mermaidTheme)
      else timer = setTimeout(() => void run(doc.source, doc.mermaidTheme), RENDER_DEBOUNCE_MS)
    }

    let prev = useDocumentStore.getState().doc
    const unsubscribe = useDocumentStore.subscribe((s) => {
      if (s.doc.source !== prev.source || s.doc.mermaidTheme !== prev.mermaidTheme) {
        const themeOnly = s.doc.source === prev.source
        prev = s.doc
        schedule(themeOnly)
      }
    })
    schedule(true)

    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
      generation++
    }
  }, [])
}
