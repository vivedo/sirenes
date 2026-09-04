import { useDocumentStore, selectIsDirty } from '../store/documentStore'
import { toast } from '../store/toastStore'
import type { OpenedFile, StorageProvider } from '../storage/types'
import { isMarkdownFileName, isSupportedFileName } from '../storage/types'
import { getLocalProvider, NoHandleError, openFromFile, openFromHandle } from '../storage/local'
import { addRecent, removeRecent } from '../storage/recent'
import { loadHandle } from '../storage/local/handles'
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
    useDocumentStore.getState().markSaved(result.name, result.origin)
    if (result.origin.kind === 'local' && result.origin.handleKey)
      void addRecent({ kind: 'local', id: result.origin.handleKey, name: result.name })
    toast.info(`Saved ${result.name}`)
    return true
  } catch (e) {
    toast.error(`Could not save: ${describe(e)}`)
    return false
  }
}

/** Save to the current origin, or fall through to Save As when there is none. */
export async function saveDocument(): Promise<boolean> {
  const { doc } = useDocumentStore.getState()
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
    useDocumentStore.getState().markSaved(result.name, result.origin)
    toast.info(`Saved ${result.name}`)
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
