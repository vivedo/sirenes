import { useEffect, useState } from 'react'
import { Menu, MenuItem, MenuSeparator } from './Menu'
import {
  openDriveFile,
  openFile,
  openFromDrive,
  openRecentLocal,
  saveDocument,
  startSaveAs,
} from '../documents/actions'
import { signOut, useDriveStore } from '../storage/drive'
import { Icon } from '../shared/Icon'
import { useOnlineStore } from '../shared/onlineStore'
import { selectIsGuest, useCollabStore } from '../collab/collabStore'
import { startSaveCopy } from '../documents/actions'
import { clearRecent, readRecent, type RecentEntry } from '../storage/recent'
import { supportsFileSystemAccess } from '../storage/local'
import { useDocumentStore, selectIsDirty } from '../store/documentStore'
import { downloadBlob } from '../shared/download'
import { serializeForFile } from '../documents/markdown'
import { modKey } from '../shared/platform'

export function FileMenu() {
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const doc = useDocumentStore((s) => s.doc)
  const dirty = useDocumentStore(selectIsDirty)
  const fsa = supportsFileSystemAccess()
  const driveConfigured = useDriveStore((s) => s.configured)
  const driveSignedIn = useDriveStore((s) => s.signedIn)
  const online = useOnlineStore((s) => s.online)
  const driveOk = driveConfigured && online
  const isGuest = useCollabStore(selectIsGuest)

  // Refresh the recent list when the document changes and every time the menu opens, since
  // recent entries are written asynchronously after a save.
  const refresh = () => void readRecent().then(setRecent)
  useEffect(refresh, [doc.id, doc.fileName])

  const downloadSource = () => {
    const name = doc.fileName ?? 'diagram.mmd'
    downloadBlob(
      new Blob([serializeForFile(doc.source, doc.markdown)], { type: 'text/plain;charset=utf-8' }),
      name,
    )
  }

  return (
    <Menu label="File" icon="file" testId="menu-file" onOpen={refresh}>
      {(close) =>
        isGuest ? (
          <>
            <li className="menu-note" role="note">
              You are a guest in a live session. The host owns the original; you can keep a copy.
            </li>
            <MenuItem
              onClick={() => {
                void startSaveCopy('local')
                close()
              }}
              testId="file-save-copy"
            >
              <Icon name="file" /> Save a copy
            </MenuItem>
            <MenuItem
              onClick={() => {
                void startSaveCopy('drive')
                close()
              }}
              disabled={!driveOk}
              testId="file-save-copy-drive"
            >
              <Icon name="cloud" /> Save a copy to Google Drive
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem
              onClick={() => {
                void openFile()
                close()
              }}
              hint={`${modKey} O`}
              testId="file-open"
            >
              Open
            </MenuItem>
            <MenuItem
              onClick={() => {
                void saveDocument()
                close()
              }}
              hint={`${modKey} S`}
              disabled={!dirty && doc.origin !== null}
              testId="file-save"
            >
              {fsa ? 'Save' : 'Save (download)'}
            </MenuItem>
            <MenuItem
              onClick={() => {
                void startSaveAs('local')
                close()
              }}
              hint={`${modKey} ⇧ S`}
              testId="file-save-as"
            >
              Save as
            </MenuItem>
            {fsa && (
              <MenuItem
                onClick={() => {
                  downloadSource()
                  close()
                }}
              >
                Download a copy
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                void openFromDrive()
                close()
              }}
              disabled={!driveOk}
              testId="drive-open"
            >
              <Icon name="cloud" /> Open from Google Drive
            </MenuItem>
            <MenuItem
              onClick={() => {
                void startSaveAs('drive')
                close()
              }}
              disabled={!driveOk}
              testId="drive-save-as"
            >
              <Icon name="cloud" /> Save to Google Drive
            </MenuItem>
            {driveSignedIn && (
              <MenuItem
                onClick={() => {
                  signOut()
                  close()
                }}
                testId="drive-sign-out"
              >
                Sign out of Google
              </MenuItem>
            )}
            {!driveConfigured && (
              <li className="menu-note" role="note">
                Google Drive needs a client id at build time. See docs/GOOGLE_SETUP.md.
              </li>
            )}
            {driveConfigured && !online && (
              <li className="menu-note" role="note">
                You are offline. Google Drive needs a connection.
              </li>
            )}
            {recent.length > 0 && (
              <>
                <MenuSeparator />
                <li className="menu-note" role="presentation">
                  Recent
                </li>
                {recent.map((r) => (
                  <MenuItem
                    key={`${r.kind}:${r.id}`}
                    onClick={() => {
                      if (r.kind === 'local') void openRecentLocal(r.id, r.name)
                      else void openDriveFile(r.id, r.name)
                      close()
                    }}
                    testId="file-recent"
                  >
                    <Icon name={r.kind === 'drive' ? 'cloud' : 'file'} size={14} /> {r.name}
                  </MenuItem>
                ))}
                <MenuItem
                  onClick={() => {
                    void clearRecent().then(() => setRecent([]))
                    close()
                  }}
                >
                  Clear recent
                </MenuItem>
              </>
            )}
          </>
        )
      }
    </Menu>
  )
}
