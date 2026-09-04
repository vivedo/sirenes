import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../shared/Icon'

interface MenuProps {
  label: ReactNode
  icon?: IconName
  align?: 'left' | 'right'
  title?: string
  children: (close: () => void) => ReactNode
  testId?: string
  /** Called each time the menu opens, e.g. to refresh its contents. */
  onOpen?: () => void
}

/** Minimal dropdown menu: toggles on click, closes on outside click or Escape. */
export function Menu({ label, icon, align = 'left', title, children, testId, onOpen }: MenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [shift, setShift] = useState(0)
  const id = useId()

  // Keep the dropdown inside the viewport: a right-aligned menu opened from a button near the
  // left edge (or vice versa) would otherwise hang off-screen. Only matters on narrow screens.
  useLayoutEffect(() => {
    if (!open || !list.current) return
    setShift(0)
    const rect = list.current.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    let dx = 0
    if (rect.left < margin) dx = margin - rect.left
    else if (rect.right > vw - margin) dx = vw - margin - rect.right
    if (dx !== 0) setShift(dx)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={root}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        title={title}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen((o) => !o)
        }}
        data-testid={testId}
      >
        {icon && <Icon name={icon} />}
        {label}
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <ul
          ref={list}
          className={`menu-list${align === 'right' ? ' align-right' : ''}`}
          role="menu"
          id={id}
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          {children(() => setOpen(false))}
        </ul>
      )}
    </div>
  )
}

export function MenuItem({
  onClick,
  children,
  hint,
  disabled,
  testId,
}: {
  onClick: () => void
  children: ReactNode
  hint?: string
  disabled?: boolean
  testId?: string
}) {
  return (
    <li role="none">
      <button role="menuitem" onClick={onClick} disabled={disabled} data-testid={testId}>
        {children}
        {hint && <span className="menu-hint">{hint}</span>}
      </button>
    </li>
  )
}

export function MenuSeparator() {
  return <li role="separator" className="menu-separator" />
}
