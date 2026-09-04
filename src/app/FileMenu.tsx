import { useEffect, useState } from 'react'
import { Menu, MenuItem, MenuSeparator } from './Menu'
import { openFile, openRecentLocal, saveDocument, saveDocumentAs } from '../documents/actions'
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

  // Refresh the recent list whenever the document identity changes (open/save).
  useEffect(() => {
    void readRecent().then(setRecent)
  }, [doc.id, doc.fileName])

  const downloadSource = () => {
    const name = doc.fileName ?? 'diagram.mmd'
    downloadBlob(
      new Blob([serializeForFile(doc.source, doc.markdown)], { type: 'text/plain;charset=utf-8' }),
      name,
    )
  }

  return (
    <Menu label="File" icon="file" testId="menu-file">
      {(close) => (
        <>
          <MenuItem
            onClick={() => {
              void openFile()
              close()
            }}
            hint={`${modKey} O`}
            testId="file-open"
          >
            Open…
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
              void saveDocumentAs()
              close()
            }}
            hint={`${modKey} ⇧ S`}
            testId="file-save-as"
          >
            Save as…
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
                    close()
                  }}
                  testId="file-recent"
                >
                  {r.name}
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
      )}
    </Menu>
  )
}
