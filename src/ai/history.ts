import { del, get, set } from 'idb-keyval'
import type { AiMessage } from './types'

const prefix = 'sirenes:ai:'

export async function readHistory(docId: string): Promise<AiMessage[]> {
  try {
    return (await get<AiMessage[]>(prefix + docId)) ?? []
  } catch {
    return []
  }
}

export async function writeHistory(docId: string, messages: AiMessage[]): Promise<void> {
  try {
    if (messages.length === 0) await del(prefix + docId)
    else await set(prefix + docId, messages)
  } catch {
    /* storage unavailable */
  }
}
