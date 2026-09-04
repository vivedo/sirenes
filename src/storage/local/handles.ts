import { del, get, set } from 'idb-keyval'
import { newId } from '../../shared/id'

const prefix = 'sirenes:handle:'

/** In-memory cache so a handle picked this session never needs a permission round-trip to read. */
const cache = new Map<string, FileSystemFileHandle>()

export async function storeHandle(handle: FileSystemFileHandle): Promise<string> {
  const key = newId()
  cache.set(key, handle)
  try {
    await set(prefix + key, handle)
  } catch {
    /* handles are not persistable in every browser; the in-memory copy still works this session */
  }
  return key
}

export async function loadHandle(key: string): Promise<FileSystemFileHandle | null> {
  const cached = cache.get(key)
  if (cached) return cached
  try {
    const h = await get<FileSystemFileHandle>(prefix + key)
    if (h) cache.set(key, h)
    return h ?? null
  } catch {
    return null
  }
}

export async function forgetHandle(key: string): Promise<void> {
  cache.delete(key)
  try {
    await del(prefix + key)
  } catch {
    /* ignore */
  }
}

type PermissionMode = 'read' | 'readwrite'

/** Ensure we may access the handle. Must run inside a user gesture when a prompt is needed. */
export async function ensurePermission(
  handle: FileSystemFileHandle,
  mode: PermissionMode,
): Promise<boolean> {
  const h = handle as FileSystemFileHandle & {
    queryPermission?: (d: { mode: PermissionMode }) => Promise<PermissionState>
    requestPermission?: (d: { mode: PermissionMode }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  if ((await h.queryPermission({ mode })) === 'granted') return true
  if (!h.requestPermission) return false
  return (await h.requestPermission({ mode })) === 'granted'
}
