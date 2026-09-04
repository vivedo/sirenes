import { useEffect, useLayoutEffect, useRef } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { usePanZoom } from './usePanZoom'
import { svgSize } from './exportDiagram'
import { Icon } from '../shared/Icon'
import './Preview.css'

export function Preview() {
  const svg = useDocumentStore((s) => s.render.svg)
  const error = useDocumentStore((s) => s.render.error)
  const rendering = useDocumentStore((s) => s.render.rendering)
  const source = useDocumentStore((s) => s.doc.source)
  const docId = useDocumentStore((s) => s.doc.id)

  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const { transform, zoomIn, zoomOut, fit, reset, setContentSize } = usePanZoom(viewport)
  const lastDocId = useRef(docId)

  // Inject the SVG string. Mermaid ran with securityLevel 'strict', and the container is inert.
  useLayoutEffect(() => {
    const el = canvas.current
    if (!el) return
    el.innerHTML = svg ?? ''
    const svgEl = el.querySelector('svg')
    if (svgEl && svg) {
      const size = svgSize(svg)
      if (size) {
        svgEl.setAttribute('width', String(size.width))
        svgEl.setAttribute('height', String(size.height))
        svgEl.style.maxWidth = 'none'
      }
      const isNewDoc = lastDocId.current !== docId
      lastDocId.current = docId
      setContentSize(size, true)
      if (isNewDoc) fit()
    } else {
      setContentSize(null, false)
    }
  }, [svg, docId, setContentSize, fit])

  useEffect(() => {
    const onResize = () => {
      /* keep transform; user can hit fit */
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const empty = source.trim() === ''

  return (
    <div className="preview" data-testid="preview">
      <div className="preview-viewport" ref={viewport}>
        <div
          className="preview-canvas"
          ref={canvas}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
          aria-live="polite"
        />
        {empty && (
          <div className="preview-empty">Start typing Mermaid on the left, or pick a template.</div>
        )}
        {error && (
          <div className="preview-error" role="alert">
            <strong>Syntax error{error.line ? ` on line ${error.line}` : ''}</strong>
            <div>{error.message}</div>
          </div>
        )}
        {rendering && <div className="preview-rendering">Rendering…</div>}
      </div>
      <div className="preview-controls" role="toolbar" aria-label="Zoom">
        <button onClick={zoomOut} title="Zoom out" aria-label="Zoom out">
          <Icon name="minus" />
        </button>
        <span className="preview-zoom" aria-live="off">
          {Math.round(transform.scale * 100)}%
        </span>
        <button onClick={zoomIn} title="Zoom in" aria-label="Zoom in">
          <Icon name="plus" />
        </button>
        <button onClick={fit} title="Fit to screen" aria-label="Fit to screen">
          <Icon name="fit" />
        </button>
        <button onClick={reset} title="Reset zoom" aria-label="Reset zoom">
          1:1
        </button>
      </div>
    </div>
  )
}
