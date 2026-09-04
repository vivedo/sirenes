import { useLayoutEffect, useRef } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useSettingsStore } from '../store/settingsStore'
import { usePanZoom } from './usePanZoom'
import { svgSize } from './exportDiagram'
import { BEAUTIFUL_SUPPORT_NOTE, isBeautifulSupported } from './beautifulEngine'
import { Icon } from '../shared/Icon'
import './Preview.css'

export function Preview() {
  const svg = useDocumentStore((s) => s.render.svg)
  const error = useDocumentStore((s) => s.render.error)
  const rendering = useDocumentStore((s) => s.render.rendering)
  const source = useDocumentStore((s) => s.doc.source)
  const docId = useDocumentStore((s) => s.doc.id)
  const ascii = useDocumentStore((s) => s.render.ascii)
  const asciiError = useDocumentStore((s) => s.render.asciiError)
  const fallback = useDocumentStore((s) => s.render.fallback)
  const previewMode = useSettingsStore((s) => s.previewMode)
  const setPreviewMode = useSettingsStore((s) => s.setPreviewMode)
  const asciiPlain = useSettingsStore((s) => s.asciiPlain)
  const setAsciiPlain = useSettingsStore((s) => s.setAsciiPlain)

  const canvas = useRef<HTMLDivElement>(null)
  const { transform, viewportRef, zoomIn, zoomOut, fit, reset, setContentSize } = usePanZoom()
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
        svgEl.dataset.width = String(size.width)
        svgEl.dataset.height = String(size.height)
        svgEl.style.maxWidth = 'none'
      }
      const isNewDoc = lastDocId.current !== docId
      lastDocId.current = docId
      setContentSize(size, true)
      if (isNewDoc) fit()
    } else {
      setContentSize(null, false)
    }
    // previewMode is a dependency because leaving ASCII mode recreates the canvas element.
  }, [svg, docId, previewMode, setContentSize, fit])

  // Zoom by resizing the SVG itself rather than CSS-scaling a rasterised layer, so the vector is
  // redrawn crisp at every zoom level. The wrapper transform only pans.
  useLayoutEffect(() => {
    const svgEl = canvas.current?.querySelector('svg')
    if (!svgEl) return
    const w = Number(svgEl.dataset.width)
    const h = Number(svgEl.dataset.height)
    if (!w || !h) return
    svgEl.setAttribute('width', String(w * transform.scale))
    svgEl.setAttribute('height', String(h * transform.scale))
  }, [svg, previewMode, transform.scale])

  const empty = source.trim() === ''
  const asciiOk = empty || isBeautifulSupported(source)

  const modeToggle = (
    <div className="segmented preview-mode" role="radiogroup" aria-label="Preview mode">
      <button
        role="radio"
        aria-checked={previewMode === 'svg'}
        className={previewMode === 'svg' ? 'active' : ''}
        onClick={() => setPreviewMode('svg')}
        data-testid="preview-mode-svg"
      >
        SVG
      </button>
      <button
        role="radio"
        aria-checked={previewMode === 'ascii'}
        className={previewMode === 'ascii' ? 'active' : ''}
        onClick={() => setPreviewMode('ascii')}
        disabled={!asciiOk && previewMode !== 'ascii'}
        title={
          asciiOk
            ? 'Text rendering'
            : `ASCII rendering is not available for this diagram type. ${BEAUTIFUL_SUPPORT_NOTE}`
        }
        data-testid="preview-mode-ascii"
      >
        ASCII
      </button>
    </div>
  )

  if (previewMode === 'ascii') {
    return (
      <div className="preview preview-text" data-testid="preview">
        {empty ? (
          <div className="preview-empty">Start typing Mermaid on the left, or pick a template.</div>
        ) : ascii ? (
          <pre className="preview-ascii" data-testid="preview-ascii">
            {ascii}
          </pre>
        ) : (
          <div className="preview-empty">{asciiError ?? 'Rendering…'}</div>
        )}
        {error && (
          <div className="preview-error" role="alert">
            <strong>Syntax error{error.line ? ` on line ${error.line}` : ''}</strong>
            <div>{error.message}</div>
          </div>
        )}
        <div className="preview-controls" role="toolbar" aria-label="Preview options">
          {modeToggle}
          <label className="preview-check" title="Use +, - and | instead of box-drawing characters">
            <input
              type="checkbox"
              checked={asciiPlain}
              onChange={(e) => setAsciiPlain(e.target.checked)}
              data-testid="ascii-plain"
            />
            Plain ASCII
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="preview" data-testid="preview">
      <div className="preview-viewport" ref={viewportRef}>
        <div
          className="preview-canvas"
          ref={canvas}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px)`,
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
        {fallback && !error && !empty && (
          <div
            className="preview-fallback"
            role="note"
            title={fallback}
            data-testid="preview-fallback"
          >
            Rendered with Mermaid: this diagram type has no beautiful theme yet.
          </div>
        )}
      </div>
      <div className="preview-controls" role="toolbar" aria-label="Zoom">
        {modeToggle}
        <span className="preview-controls-sep" />
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
