import { useEffect, useRef, useState } from 'react'
import { clearAllData } from './clearAllData'

export function PrivacyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const close = () => {
    setConfirming(false)
    onClose()
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="privacy-title"
      className="privacy"
      data-testid="privacy-dialog"
    >
      <h2 id="privacy-title">Privacy and your data</h2>
      <p>Sirenes has no server. Everything below happens in your browser.</p>
      <h3>What stays on this device</h3>
      <ul>
        <li>
          Your diagram (autosave), UI preferences and recent files, in this browser's storage.
        </li>
        <li>Your OpenRouter API key, in localStorage or sessionStorage as you chose.</li>
        <li>AI conversations, per diagram.</li>
        <li>Handles to local files you opened, so Save can write back to them.</li>
      </ul>
      <h3>What leaves the browser, and to whom</h3>
      <ul>
        <li>
          <strong>Share links</strong> contain the full diagram, compressed, in the URL. Anyone with
          the link can read it. URLs can persist in browser history and chat logs.
        </li>
        <li>
          <strong>OpenRouter</strong> (openrouter.ai) receives your API key, the diagram and your
          prompts when you use the AI assistant, and forwards them to the model you picked.
        </li>
        <li>
          <strong>Google</strong> receives requests only when you use Drive: sign-in
          (accounts.google.com) and the files you pick or create (www.googleapis.com). Sirenes asks
          for the drive.file scope only and keeps the access token in memory.
        </li>
        <li>
          <strong>Live sessions</strong> send the diagram, its theme and your cursor directly to the
          other participants over an encrypted WebRTC channel. A PeerJS signalling server brokers
          the connection and sees connection metadata, never content. Your files, Drive and AI key
          are not part of a session. If the host shares its assistant, guests' prompts and the
          replies go through the host's OpenRouter key and are visible to everyone in the session.
        </li>
      </ul>
      <p>
        No analytics, no third-party scripts beyond Google's sign-in and Picker, no cookies of our
        own. The full{' '}
        <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">
          privacy policy
        </a>{' '}
        and{' '}
        <a href={`${import.meta.env.BASE_URL}terms.html`} target="_blank" rel="noreferrer">
          terms of service
        </a>{' '}
        are published as plain pages.
      </p>
      <div className="dialog-actions">
        {confirming ? (
          <>
            <span className="ai-muted">
              This removes your key, autosave, history and recent files.
            </span>
            <button onClick={() => setConfirming(false)}>Keep</button>
            <button
              className="danger"
              onClick={() => void clearAllData()}
              data-testid="clear-all-confirm"
            >
              Clear everything
            </button>
          </>
        ) : (
          <>
            <button className="outline" onClick={() => setConfirming(true)} data-testid="clear-all">
              Clear all data
            </button>
            <button className="primary" onClick={close}>
              Close
            </button>
          </>
        )}
      </div>
    </dialog>
  )
}
