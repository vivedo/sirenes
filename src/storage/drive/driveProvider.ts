import type {
  ConflictInfo,
  DocumentOrigin,
  OpenedFile,
  SaveResult,
  StorageProvider,
  SaveTarget,
} from '../types'
import { createFile, downloadFile, getFileMeta, updateFile, DriveApiError } from './api'
import { getAccessToken, invalidateToken } from './auth'
import { pickDriveFile, pickDriveFolder, type PickedItem } from './picker'

/** Run a Drive call; on 401 drop the token, re-prompt once, and retry. */
async function withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getAccessToken({ interactive: true })
  try {
    return await fn(token)
  } catch (e) {
    if (e instanceof DriveApiError && e.status === 401) {
      invalidateToken()
      const fresh = await getAccessToken({ interactive: true })
      return fn(fresh)
    }
    throw e
  }
}

export async function openDriveFileById(id: string): Promise<OpenedFile> {
  return withToken(async (token) => {
    const [meta, content] = await Promise.all([getFileMeta(id, token), downloadFile(id, token)])
    return {
      name: meta.name,
      content,
      origin: { kind: 'drive', fileId: meta.id, modifiedTime: meta.modifiedTime },
    }
  })
}

/** Let the user choose a Drive folder with the Picker. Resolves null on cancel. */
export async function chooseDriveFolder(): Promise<PickedItem | null> {
  const token = await getAccessToken({ interactive: true })
  return pickDriveFolder(token)
}

export const driveProvider: StorageProvider = {
  id: 'drive',
  needsSaveTarget: true,

  async open() {
    const token = await getAccessToken({ interactive: true })
    const picked = await pickDriveFile(token)
    if (!picked) return null
    return openDriveFileById(picked.id)
  },

  async save(origin: DocumentOrigin, content: string, name: string): Promise<SaveResult> {
    if (origin.kind !== 'drive') throw new Error('Not a Drive document')
    return withToken(async (token) => {
      const meta = await updateFile(origin.fileId, content, token)
      return {
        name: meta.name || name,
        origin: { kind: 'drive', fileId: meta.id, modifiedTime: meta.modifiedTime },
      }
    })
  },

  async saveAs(content: string, target: SaveTarget): Promise<SaveResult | null> {
    return withToken(async (token) => {
      const meta = await createFile(target.name, content, token, target.folderId ?? null)
      return {
        name: meta.name,
        origin: { kind: 'drive', fileId: meta.id, modifiedTime: meta.modifiedTime },
      }
    })
  },

  async checkConflict(origin: DocumentOrigin): Promise<ConflictInfo | null> {
    if (origin.kind !== 'drive' || !origin.modifiedTime) return null
    const meta = await withToken((token) => getFileMeta(origin.fileId, token))
    if (meta.modifiedTime && meta.modifiedTime !== origin.modifiedTime) {
      return {
        message: `This file changed on Google Drive at ${new Date(meta.modifiedTime).toLocaleString()} since you opened it.`,
        remoteModifiedTime: meta.modifiedTime,
      }
    }
    return null
  },
}
