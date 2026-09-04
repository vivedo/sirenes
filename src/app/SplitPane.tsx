import { useCallback, useRef, type ReactNode } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import type { Layout } from '../store/types'

export function SplitPane({
  left,
  right,
  layoutOverride,
}: {
  left: ReactNode
  right: ReactNode
  /** Phones show one pane at a time regardless of the persisted desktop layout. */
  layoutOverride?: Layout
}) {
  const storedLayout = useSettingsStore((s) => s.layout)
  const layout = layoutOverride ?? storedLayout
  const ratio = useSettingsStore((s) => s.splitRatio)
  const setRatio = useSettingsStore((s) => s.setSplitRatio)
  const root = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = root.current
      if (!el) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const rect = el.getBoundingClientRect()
      const move = (ev: PointerEvent) => setRatio((ev.clientX - rect.left) / rect.width)
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        el.classList.remove('resizing')
      }
      el.classList.add('resizing')
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [setRatio],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setRatio(ratio - 0.02)
    if (e.key === 'ArrowRight') setRatio(ratio + 0.02)
  }

  const columns =
    layout === 'editor'
      ? '1fr 0 0'
      : layout === 'preview'
        ? '0 0 1fr'
        : `${ratio}fr 6px ${1 - ratio}fr`

  return (
    <div className={`split layout-${layout}`} ref={root} style={{ gridTemplateColumns: columns }}>
      <div className="split-left" hidden={layout === 'preview'}>
        {left}
      </div>
      <div
        className="split-divider"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={layout === 'split' ? 0 : -1}
        hidden={layout !== 'split'}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      <div className="split-right" hidden={layout === 'editor'}>
        {right}
      </div>
    </div>
  )
}
