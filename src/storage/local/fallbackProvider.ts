import type { DocumentOrigin, OpenedFile, SaveResult, StorageProvider } from '../types'
import { FILE_EXTENSIONS } from '../types'
import { downloadBlob } from '../../shared/download'

/** Read a File object (from an <input>, drag and drop, or a handle). */
export async function openFromFile(file: File): Promise<OpenedFile> {
  return { name: file.name, content: await file.text(), origin: { kind: 'local', handleKey: null } }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = FILE_EXTENSIONS.join(',')
    input.style.display = 'none'
    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => finish(null))
    // Some browsers never fire 'cancel'; give up once focus returns without a change.
    window.addEventListener('focus', () => setTimeout(() => finish(null), 1500), { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

/** Browsers without the File System Access API: open via <input type=file>, save via download. */
export const fallbackProvider: StorageProvider = {
  id: 'local',

  async open() {
    const file = await pickFile()
    return file ? openFromFile(file) : null
  },

  async save(origin: DocumentOrigin, content: string, name: string): Promise<SaveResult> {
    downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), name)
    return { name, origin }
  },

  async saveAs(content: string, suggestedName: string): Promise<SaveResult | null> {
    const name = window.prompt('File name', suggestedName)
    if (!name) return null
    downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), name)
    return { name, origin: { kind: 'local', handleKey: null } }
  },
}
