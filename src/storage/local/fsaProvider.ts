import type { DocumentOrigin, OpenedFile, SaveResult, SaveTarget, StorageProvider } from '../types'
import { ensurePermission, loadHandle, storeHandle } from './handles'

const TYPES: FilePickerAcceptType[] = [
  {
    description: 'Mermaid diagram',
    accept: { 'text/plain': ['.mmd', '.mermaid', '.txt'], 'text/markdown': ['.md', '.markdown'] },
  },
]

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window
  )
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

export class NoHandleError extends Error {
  constructor() {
    super('The file handle for this document is no longer available.')
    this.name = 'NoHandleError'
  }
}

export async function openFromHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  if (!(await ensurePermission(handle, 'read')))
    throw new Error('Permission to read the file was denied.')
  const file = await handle.getFile()
  const key = await storeHandle(handle)
  return { name: file.name, content: await file.text(), origin: { kind: 'local', handleKey: key } }
}

async function writeHandle(handle: FileSystemFileHandle, content: string) {
  if (!(await ensurePermission(handle, 'readwrite')))
    throw new Error('Permission to write the file was denied.')
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

/** Local files via the File System Access API (Chromium, Edge). Saves overwrite in place. */
export const fsaProvider: StorageProvider = {
  id: 'local',
  needsSaveTarget: false,

  async open() {
    try {
      const [handle] = await window.showOpenFilePicker({ types: TYPES, multiple: false })
      return await openFromHandle(handle)
    } catch (e) {
      if (isAbort(e)) return null
      throw e
    }
  },

  async save(origin: DocumentOrigin, content: string, name: string): Promise<SaveResult> {
    if (origin.kind !== 'local' || !origin.handleKey) throw new NoHandleError()
    const handle = await loadHandle(origin.handleKey)
    if (!handle) throw new NoHandleError()
    await writeHandle(handle, content)
    return { name: handle.name || name, origin }
  },

  async saveAs(content: string, target: SaveTarget): Promise<SaveResult | null> {
    try {
      const handle = await window.showSaveFilePicker({ types: TYPES, suggestedName: target.name })
      await writeHandle(handle, content)
      const key = await storeHandle(handle)
      return { name: handle.name, origin: { kind: 'local', handleKey: key } }
    } catch (e) {
      if (isAbort(e)) return null
      throw e
    }
  },
}
