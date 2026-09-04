import { useDocumentStore, selectIsDirty } from '../store/documentStore'
import { toast } from '../store/toastStore'
import type { OpenedFile, SaveResult, StorageProvider } from '../storage/types'
import { isMarkdownFileName, isSupportedFileName } from '../storage/types'
import { getLocalProvider, NoHandleError, openFromFile, openFromHandle } from '../storage/local'
import { addRecent, removeRecent } from '../storage/recent'
import { loadHandle } from '../storage/local/handles'
import { driveProvider, openDriveFileById } from '../storage/drive'
import { ask } from '../app/dialogStore'
import { extractMermaid, serializeForFile } from './markdown'
import { documentBaseName } from './naming'

/** Ask before discarding unsaved work. Returns true when it is fine to proceed. */
export function confirmDiscard(): boolean {
  const s = useDocumentStore.getState()
  if (!selectIsDirty(s)) return true
  return window.confirm('Discard unsaved changes to the current diagram?')
}

/** Turn an opened file into the current document. Handles Markdown extraction. */
export function loadOpenedFile(file: OpenedFile): boolean {
  if (!isSupportedFileName(file.name)) {
    toast.error(`Unsupported file type: ${file.name}`)
    return false
  }
  let source = file.content
  let markdown = null
  if (isMarkdownFileName(file.name)) {
    const extracted = extractMermaid(file.content)
    if (!extracted) {
      toast.error(`No \`\`\`mermaid block found in ${file.name}`)
      return false
    }
    source = extracted.code
    markdown = extracted.wrapper
    if (extracted.count > 1)
      toast.warn(`${file.name} has ${extracted.count} mermaid blocks. Editing the first one.`)
  }
  useDocumentStore.getState().newDocument({
    source,
    fileName: file.name,
    saved: true,
    origin: file.origin,
    markdown,
  })
  if (file.origin.kind === 'local' && file.origin.handleKey)
    void addRecent({ kind: 'local', id: file.origin.handleKey, name: file.name })
  if (file.origin.kind === 'drive')
    void addRecent({ kind: 'drive', id: file.origin.fileId, name: file.name })
  return true
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export async function openFile(provider: StorageProvider = getLocalProvider()): Promise<void> {
  if (!confirmDiscard()) return
  try {
    const opened = await provider.open()
    if (opened) loadOpenedFile(opened)
  } catch (e) {
    toast.error(`Could not open file: ${describe(e)}`)
  }
}

/** Drag and drop / file input entry point. Prefers a real handle so Save can write back. */
export async function openDroppedItem(
  item: DataTransferItem | null,
  file: File | null,
): Promise<void> {
  if (!confirmDiscard()) return
  try {
    const getHandle = (
      item as
        | (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
        | null
    )?.getAsFileSystemHandle
    if (item && getHandle) {
      const handle = await getHandle.call(item)
      if (handle && handle.kind === 'file') {
        loadOpenedFile(await openFromHandle(handle as FileSystemFileHandle))
        return
      }
    }
    if (file) loadOpenedFile(await openFromFile(file))
  } catch (e) {
    toast.error(`Could not open file: ${describe(e)}`)
  }
}

export async function openRecentLocal(handleKey: string, name: string): Promise<void> {
  if (!confirmDiscard()) return
  const handle = await loadHandle(handleKey)
  if (!handle) {
    toast.error(`${name} is no longer available.`)
    await removeRecent('local', handleKey)
    return
  }
  try {
    loadOpenedFile(await openFromHandle(handle))
  } catch (e) {
    toast.error(`Could not open ${name}: ${describe(e)}`)
  }
}

function suggestedFileName(): string {
  const { doc } = useDocumentStore.getState()
  if (doc.fileName) return doc.fileName
  return `${documentBaseName(null)}.mmd`
}

function recordSave(result: SaveResult) {
  useDocumentStore.getState().markSaved(result.name, result.origin)
  if (result.origin.kind === 'local' && result.origin.handleKey)
    void addRecent({ kind: 'local', id: result.origin.handleKey, name: result.name })
  if (result.origin.kind === 'drive')
    void addRecent({ kind: 'drive', id: result.origin.fileId, name: result.name })
  toast.info(`Saved ${result.name}${result.origin.kind === 'drive' ? ' to Google Drive' : ''}`)
}

export async function saveDocumentAs(
  provider: StorageProvider = getLocalProvider(),
): Promise<boolean> {
  const { doc } = useDocumentStore.getState()
  try {
    const result = await provider.saveAs(
      serializeForFile(doc.source, doc.markdown),
      suggestedFileName(),
    )
    if (!result) return false
    recordSave(result)
    return true
  } catch (e) {
    toast.error(`Could not save: ${describe(e)}`)
    return false
  }
}

/** Save to the current origin, or fall through to Save As when there is none. */
export async function saveDocument(): Promise<boolean> {
  const { doc } = useDocumentStore.getState()
  if (doc.origin?.kind === 'drive') return saveToDrive()
  const provider = getLocalProvider()
  if (!doc.origin || doc.origin.kind !== 'local') return saveDocumentAs(provider)
  if (doc.origin.handleKey === null) {
    // Download fallback: every save is a fresh download of the same name.
    await provider.save(
      doc.origin,
      serializeForFile(doc.source, doc.markdown),
      doc.fileName ?? suggestedFileName(),
    )
    useDocumentStore.getState().markSaved()
    return true
  }
  try {
    const result = await provider.save(
      doc.origin,
      serializeForFile(doc.source, doc.markdown),
      doc.fileName ?? suggestedFileName(),
    )
    recordSave(result)
    return true
  } catch (e) {
    if (e instanceof NoHandleError) {
      toast.warn('The original file is no longer reachable. Choose where to save it.')
      return saveDocumentAs(provider)
    }
    toast.error(`Could not save: ${describe(e)}`)
    return false
  }
}

// ---------------------------------------------------------------------------------------------
// Google Drive

export async function openFromDrive(): Promise<void> {
  return openFile(driveProvider)
}

export async function openDriveFile(fileId: string, name = 'the file'): Promise<void> {
  if (!confirmDiscard()) return
  try {
    loadOpenedFile(await openDriveFileById(fileId))
  } catch (e) {
    toast.error(`Could not open ${name} from Google Drive: ${describe(e)}`)
    if (/not found/i.test(describe(e))) await removeRecent('drive', fileId)
  }
}

export async function saveAsToDrive(): Promise<boolean> {
  return saveDocumentAs(driveProvider)
}

/** Save to the Drive origin, warning first when the remote copy changed since we opened it. */
export async function saveToDrive(): Promise<boolean> {
  const { doc } = useDocumentStore.getState()
  if (doc.origin?.kind !== 'drive') return saveAsToDrive()
  try {
    const conflict = await driveProvider.checkConflict?.(doc.origin)
    if (conflict) {
      const choice = await ask({
        title: 'File changed on Google Drive',
        message: `${conflict.message} Overwrite it with your version, or save yours as a new copy?`,
        options: [
          { id: 'copy', label: 'Save as copy', primary: true },
          { id: 'overwrite', label: 'Overwrite', danger: true },
        ],
      })
      if (choice === null) return false
      if (choice === 'copy') return saveAsToDrive()
    }
    const result = await driveProvider.save(
      doc.origin,
      serializeForFile(doc.source, doc.markdown),
      doc.fileName ?? suggestedFileName(),
    )
    recordSave(result)
    return true
  } catch (e) {
    toast.error(`Could not save to Google Drive: ${describe(e)}`)
    return false
  }
}
