import { useEffect, useRef } from 'react'
import { useSaveUiStore } from './saveUiStore'
import { useSettingsStore } from '../store/settingsStore'
import { useDriveStore, chooseDriveFolder } from '../storage/drive'
import { supportsFileSystemAccess } from '../storage/local'
import { useOnlineStore } from '../shared/onlineStore'
import { performSaveAs } from '../documents/actions'
import { Icon } from '../shared/Icon'

/**
 * Non-modal save panel anchored under the toolbar. Asks for a file name and, for Google Drive,
 * a destination folder chosen with the Google Picker.
 */
export function SavePanel() {
  const { open, destination, name, busy, error, hide, setDestination, setName, setError } =
    useSaveUiStore()
  const driveConfigured = useDriveStore((s) => s.configured)
  const online = useOnlineStore((s) => s.online)
  const folder = useSettingsStore((s) => s.driveFolder)
  const setFolder = useSettingsStore((s) => s.setDriveFolder)
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const fsa = supportsFileSystemAccess()

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    input.current?.select()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide()
    const onDown = (e: PointerEvent) => {
      // Clicks inside the Google Picker iframe live in another document; ignore them.
      if (root.current && !root.current.contains(e.target as Node) && document.hasFocus()) hide()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, hide])

  if (!open) return null
  const driveOk = driveConfigured && online

  const pickFolder = async () => {
    try {
      const picked = await chooseDriveFolder()
      if (picked) setFolder(picked)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the folder picker')
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    void performSaveAs(destination, {
      name: name.trim(),
      folderId: destination === 'drive' ? (folder?.id ?? null) : null,
    })
  }

  return (
    <div
      className="save-panel"
      ref={root}
      role="dialog"
      aria-label="Save as"
      data-testid="save-panel"
    >
      <form onSubmit={submit}>
        <div className="segmented save-destinations" role="radiogroup" aria-label="Save to">
          <button
            type="button"
            role="radio"
            aria-checked={destination === 'local'}
            className={destination === 'local' ? 'active' : ''}
            onClick={() => setDestination('local')}
            data-testid="save-dest-local"
          >
            <Icon name="file" /> This device
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={destination === 'drive'}
            className={destination === 'drive' ? 'active' : ''}
            onClick={() => setDestination('drive')}
            disabled={!driveOk}
            title={
              !driveConfigured
                ? 'Google Drive is not configured for this deployment'
                : !online
                  ? 'You are offline'
                  : undefined
            }
            data-testid="save-dest-drive"
          >
            <Icon name="cloud" /> Google Drive
          </button>
        </div>

        <label className="save-field">
          <span>File name</span>
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            required
            data-testid="save-name"
          />
        </label>

        {destination === 'drive' && (
          <div className="save-field">
            <span>Folder</span>
            <div className="save-folder">
              <span className="save-folder-name" data-testid="save-folder">
                <Icon name="cloud" size={14} /> {folder?.name ?? 'My Drive'}
              </span>
              <button
                type="button"
                onClick={() => void pickFolder()}
                data-testid="save-choose-folder"
              >
                Choose
              </button>
              {folder && (
                <button type="button" onClick={() => setFolder(null)} aria-label="Use My Drive">
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {destination === 'local' && (
          <p className="ai-muted save-hint">
            {fsa ? 'Your browser will ask where to put the file.' : 'The file will be downloaded.'}
          </p>
        )}

        {error && (
          <div className="ai-error" role="alert">
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={hide}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !name.trim()}
            data-testid="save-submit"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
