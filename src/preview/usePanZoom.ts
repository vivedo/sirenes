import { useCallback, useEffect, useRef, useState } from 'react'

export interface Transform {
  x: number
  y: number
  scale: number
}

const MIN_SCALE = 0.1
const MAX_SCALE = 8
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

/**
 * Pan/zoom state for the preview viewport. The viewport element is tracked through a callback
 * ref so listeners follow it when the element is recreated (e.g. after leaving ASCII mode), and a
 * ResizeObserver re-fits the diagram whenever the viewport changes size.
 */
export function usePanZoom() {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const elRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    elRef.current = node
    setEl(node)
  }, [])
  const contentSize = useRef<{ width: number; height: number } | null>(null)
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  )

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const node = elRef.current
    setTransform((t) => {
      const scale = clampScale(t.scale * factor)
      if (!node) return { ...t, scale }
      const rect = node.getBoundingClientRect()
      const px = cx ?? rect.width / 2
      const py = cy ?? rect.height / 2
      const ratio = scale / t.scale
      return { scale, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio }
    })
  }, [])

  const fit = useCallback(() => {
    const node = elRef.current
    const size = contentSize.current
    if (!node || !size) return
    const rect = node.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return // not laid out yet; the observer will call again
    const pad = 24
    const scale = clampScale(
      Math.min((rect.width - pad * 2) / size.width, (rect.height - pad * 2) / size.height, 4),
    )
    setTransform({
      scale,
      x: (rect.width - size.width * scale) / 2,
      y: (rect.height - size.height * scale) / 2,
    })
  }, [])

  const reset = useCallback(() => {
    const node = elRef.current
    const size = contentSize.current
    if (!node || !size) return setTransform({ x: 0, y: 0, scale: 1 })
    const rect = node.getBoundingClientRect()
    setTransform({
      scale: 1,
      x: (rect.width - size.width) / 2,
      y: Math.max(24, (rect.height - size.height) / 2),
    })
  }, [])

  /** Called by the preview after each render with the new intrinsic size. */
  const setContentSize = useCallback(
    (size: { width: number; height: number } | null, fitIfFirst: boolean) => {
      const first = contentSize.current === null
      contentSize.current = size
      if (size && first && fitIfFirst) fit()
    },
    [fit],
  )

  useEffect(() => {
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const factor = Math.exp(-e.deltaY * 0.0015)
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }))
      }
    }
    // Touch: track every active pointer so two fingers can pinch-zoom.
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch: { dist: number; scale: number } | null = null
    const distance = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const midpoint = () => {
      const [a, b] = [...pointers.values()]
      const rect = el.getBoundingClientRect()
      return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic events have no active pointer to capture */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        drag.current = null
        setTransform((t) => {
          pinch = { dist: distance(), scale: t.scale }
          return t
        })
        return
      }
      setTransform((t) => {
        drag.current = { startX: e.clientX, startY: e.clientY, originX: t.x, originY: t.y }
        return t
      })
      el.classList.add('dragging')
    }
    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size === 2) {
        const p = pinch
        const factor = distance() / p.dist
        const m = midpoint()
        setTransform((t) => {
          const scale = clampScale(p.scale * factor)
          const ratio = scale / t.scale
          return { scale, x: m.x - (m.x - t.x) * ratio, y: m.y - (m.y - t.y) * ratio }
        })
        return
      }
      const d = drag.current
      if (!d) return
      setTransform((t) => ({
        ...t,
        x: d.originX + e.clientX - d.startX,
        y: d.originY + e.clientY - d.startY,
      }))
    }
    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      drag.current = null
      el.classList.remove('dragging')
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)

    // Re-fit when the viewport is first laid out or changes size (layout switch, AI panel, window).
    let lastW = 0
    let lastH = 0
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect
            if (width === lastW && height === lastH) return
            lastW = width
            lastH = height
            fit()
          })
        : null
    observer?.observe(el)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      observer?.disconnect()
    }
  }, [el, zoomAt, fit])

  return {
    transform,
    viewportRef,
    zoomIn: () => zoomAt(1.25),
    zoomOut: () => zoomAt(0.8),
    fit,
    reset,
    setContentSize,
  }
}
