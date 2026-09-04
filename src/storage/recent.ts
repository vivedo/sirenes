import { get, set } from 'idb-keyval'

export interface RecentEntry {
  /** handleKey for local files, fileId for Drive. */
  id: string
  kind: 'local' | 'drive'
  name: string
  openedAt: number
}

const KEY = 'sirenes:recent'
const MAX = 10

export async function readRecent(): Promise<RecentEntry[]> {
  try {
    return (await get<RecentEntry[]>(KEY)) ?? []
  } catch {
    return []
  }
}

export async function addRecent(entry: Omit<RecentEntry, 'openedAt'>): Promise<RecentEntry[]> {
  const list = (await readRecent()).filter((e) => !(e.kind === entry.kind && e.id === entry.id))
  list.unshift({ ...entry, openedAt: Date.now() })
  const trimmed = list.slice(0, MAX)
  try {
    await set(KEY, trimmed)
  } catch {
    /* ignore */
  }
  return trimmed
}

export async function removeRecent(kind: RecentEntry['kind'], id: string): Promise<RecentEntry[]> {
  const list = (await readRecent()).filter((e) => !(e.kind === kind && e.id === id))
  try {
    await set(KEY, list)
  } catch {
    /* ignore */
  }
  return list
}

export async function clearRecent(): Promise<void> {
  try {
    await set(KEY, [])
  } catch {
    /* ignore */
  }
}
