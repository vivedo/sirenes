import { useDocumentStore, selectIsDirty } from '../store/documentStore'
import { useSaveUiStore, type SaveDestination } from '../app/saveUiStore'
import { toast } from '../store/toastStore'
import type { DocumentState } from '../store/types'
import type { OpenedFile, SaveResult, SaveTarget, StorageProvider } from '../storage/types'
import { isMarkdownFileName, isSupportedFileName } from '../storage/types'
import { getLocalProvider, NoHandleError, openFromFile, openFromHandle } from '../storage/local'
import { addRecent, removeRecent } from '../storage/recent'
import { loadHandle } from '../storage/local/handles'
import { driveProvider, openDriveFileById } from '../storage/drive'
import { ask } from '../app/dialogStore'
import { extractMermaid, serializeForFile } from './markdown'
import { documentBaseName } from './naming'

// ---------------------------------------------------------------------------------------------
// Replacing the current document: no confirmation dialog, an Undo toast instead.

/**
 * Run `replace` (which swaps in a new document). If the current document had unsaved work,
 * offer to bring it back via a toast. The old document is only held in memory.
 */
export function replaceDocument(replace: () => void, what: string) {
  const before = useDocumentStore.getState()
  const previous: DocumentState | null = selectIsDirty(before) ? before.doc : null
  replace()
  if (previous) {
    const label = previous.fileName ?? 'your unsaved diagram'
    toast.action(`${what}. ${label} was set aside.`, 'Undo', () => {
      useDocumentStore.getState().loadDocument(previous)
    })
  }
}

// ---------------------------------------------------------------------------------------------
// Opening

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
  replaceDocument(
    () =>
      useDocumentStore.getState().newDocument({
        source,
        fileName: file.name,
        saved: true,
        origin: file.origin,
        markdown,
      }),
    `Opened ${file.name}`,
  )
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

export function startNewDocument(source?: string) {
  replaceDocument(() => useDocumentStore.getState().newDocument({ source }), 'New diagram')
}

// ---------------------------------------------------------------------------------------------
// Saving

function suggestedFileName(): string {
  const { doc } = useDocumentStore.getState()
  if (doc.fileName) return doc.fileName
  return `${documentBaseName(null)}.mmd`
}

function providerFor(destination: SaveDestination): StorageProvider {
  return destination === 'drive' ? driveProvider : getLocalProvider()
}

function recordSave(result: SaveResult) {
  useDocumentStore.getState().markSaved(result.name, result.origin)
  if (result.origin.kind === 'local' && result.origin.handleKey)
    void addRecent({ kind: 'local', id: result.origin.handleKey, name: result.name })
  if (result.origin.kind === 'drive')
    void addRecent({ kind: 'drive', id: result.origin.fileId, name: result.name })
  toast.info(`Saved ${result.name}${result.origin.kind === 'drive' ? ' to Google Drive' : ''}`)
}

/**
 * Begin "Save as". Providers with their own picker (File System Access) go straight there;
 * the others open the in-app save panel for a name and, on Drive, a folder.
 */
export async function startSaveAs(
  destination: SaveDestination,
  suggestedName = suggestedFileName(),
): Promise<void> {
  const provider = providerFor(destination)
  if (!provider.needsSaveTarget) {
    await performSaveAs(destination, { name: suggestedName })
    return
  }
  useSaveUiStore.getState().show(destination, suggestedName)
}

/** Write a new file to the chosen destination. Called by the save panel or directly for FSA. */
export async function performSaveAs(
  destination: SaveDestination,
  target: SaveTarget,
): Promise<boolean> {
  const provider = providerFor(destination)
  const ui = useSaveUiStore.getState()
  const { doc } = useDocumentStore.getState()
  ui.setBusy(true)
  try {
    const result = await provider.saveAs(serializeForFile(doc.source, doc.markdown), target)
    if (!result) {
      ui.setBusy(false)
      return false
    }
    recordSave(result)
    ui.hide()
    return true
  } catch (e) {
    const message = `Could not save: ${describe(e)}`
    if (useSaveUiStore.getState().open) ui.setError(message)
    else toast.error(message)
    return false
  }
}

/** Save to the current origin, or start Save as when there is none. */
export async function saveDocument(): Promise<boolean> {
  const { doc } = useDocumentStore.getState()
  if (doc.origin?.kind === 'drive') return saveToDrive()
  const provider = getLocalProvider()
  if (!doc.origin || doc.origin.kind !== 'local') {
    await startSaveAs('local')
    return false
  }
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
      await startSaveAs('local')
      return false
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
  try {
    loadOpenedFile(await openDriveFileById(fileId))
  } catch (e) {
    toast.error(`Could not open ${name} from Google Drive: ${describe(e)}`)
    if (/not found/i.test(describe(e))) await removeRecent('drive', fileId)
  }
}

function copyName(name: string): string {
  const m = /^(.*?)(\.[^.]+)?$/.exec(name)
  return `${m?.[1] ?? name} (copy)${m?.[2] ?? ''}`
}

/** Save to the Drive origin, warning first when the remote copy changed since we opened it. */
export async function saveToDrive(): Promise<boolean> {
  const { doc } = useDocumentStore.getState()
  if (doc.origin?.kind !== 'drive') {
    await startSaveAs('drive')
    return false
  }
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
      if (choice === 'copy') {
        await startSaveAs('drive', copyName(doc.fileName ?? suggestedFileName()))
        return false
      }
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
