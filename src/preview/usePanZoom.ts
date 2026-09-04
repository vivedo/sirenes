import { useCallback, useEffect, useRef, useState } from 'react'

export interface Transform {
  x: number
  y: number
  scale: number
}

const MIN_SCALE = 0.1
const MAX_SCALE = 8

export function usePanZoom(container: React.RefObject<HTMLElement | null>) {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const contentSize = useRef<{ width: number; height: number } | null>(null)
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  )

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const el = container.current
      setTransform((t) => {
        const scale = clampScale(t.scale * factor)
        if (!el) return { ...t, scale }
        const rect = el.getBoundingClientRect()
        const px = cx ?? rect.width / 2
        const py = cy ?? rect.height / 2
        const ratio = scale / t.scale
        return { scale, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio }
      })
    },
    [container],
  )

  const fit = useCallback(() => {
    const el = container.current
    const size = contentSize.current
    if (!el || !size) return
    const rect = el.getBoundingClientRect()
    const pad = 24
    const scale = clampScale(
      Math.min((rect.width - pad * 2) / size.width, (rect.height - pad * 2) / size.height, 4),
    )
    setTransform({
      scale,
      x: (rect.width - size.width * scale) / 2,
      y: (rect.height - size.height * scale) / 2,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [])

  const reset = useCallback(() => {
    const el = container.current
    const size = contentSize.current
    if (!el || !size) return setTransform({ x: 0, y: 0, scale: 1 })
    const rect = el.getBoundingClientRect()
    setTransform({
      scale: 1,
      x: (rect.width - size.width) / 2,
      y: Math.max(24, (rect.height - size.height) / 2),
    })
  }, [container])

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
    const el = container.current
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
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      el.setPointerCapture(e.pointerId)
      setTransform((t) => {
        drag.current = { startX: e.clientX, startY: e.clientY, originX: t.x, originY: t.y }
        return t
      })
      el.classList.add('dragging')
    }
    const onPointerMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      setTransform((t) => ({
        ...t,
        x: d.originX + e.clientX - d.startX,
        y: d.originY + e.clientY - d.startY,
      }))
    }
    const onPointerUp = () => {
      drag.current = null
      el.classList.remove('dragging')
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [zoomAt])

  return {
    transform,
    zoomIn: () => zoomAt(1.25),
    zoomOut: () => zoomAt(0.8),
    fit,
    reset,
    setContentSize,
  }
}
