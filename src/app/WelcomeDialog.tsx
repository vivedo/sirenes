import { useEffect, useRef } from 'react'
import { Icon } from '../shared/Icon'

import { markWelcomed } from './welcome'

/** Shown once, to first-time visitors who did not arrive through a live-session link. */
export function WelcomeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // autoFocus fires before the dialog is shown; focus the primary action ourselves.
      d.querySelector<HTMLButtonElement>('[data-testid="welcome-start"]')?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  const close = () => {
    markWelcomed()
    onClose()
  }

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="welcome-title"
      className="welcome"
      data-testid="welcome-dialog"
    >
      <div className="welcome-head">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="36" height="36" />
        <h2 id="welcome-title">Sirenes</h2>
      </div>
      <p className="welcome-lead">A Mermaid diagram editor that runs in your browser.</p>
      <ul className="welcome-list">
        <li>
          <Icon name="code" /> Type Mermaid on the left, see the diagram on the right. Errors show
          on the line.
        </li>
        <li>
          <Icon name="link" /> The address bar always holds your diagram. Copy it to share.
        </li>
        <li>
          <Icon name="file" /> Save to a file on your computer or to your Google Drive. One file can
          hold several diagrams.
        </li>
        <li>
          <Icon name="sparkle" /> Edit with an AI assistant using your own OpenRouter key.
        </li>
        <li>
          <Icon name="users" /> Work on a file live with other people, straight from browser to
          browser.
        </li>
      </ul>
      <p className="welcome-privacy">
        Nothing is uploaded to us. Your diagrams stay in this browser until you save or share them.
        Details in the{' '}
        <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">
          privacy policy
        </a>{' '}
        and{' '}
        <a href={`${import.meta.env.BASE_URL}terms.html`} target="_blank" rel="noreferrer">
          terms
        </a>
        .
      </p>
      <div className="dialog-actions">
        <button className="primary" onClick={close} data-testid="welcome-start">
          Start
        </button>
      </div>
    </dialog>
  )
}
