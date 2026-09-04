/** Where a document came from and where "Save" writes back to. Serialisable (lives in autosave). */
export type DocumentOrigin =
  | {
      kind: 'local'
      /** Key of the persisted FileSystemFileHandle in IndexedDB. null when the browser has no File System Access API and saves are downloads. */
      handleKey: string | null
    }
  | {
      kind: 'drive'
      fileId: string
      /** Drive modifiedTime at open/save, for conflict detection. */
      modifiedTime: string | null
    }

/** For .md files: the text around the first ```mermaid block, so saving leaves the rest untouched. */
export interface MarkdownWrapper {
  before: string
  after: string
}

export interface OpenedFile {
  name: string
  /** Raw file content; the document layer decides whether it is Markdown. */
  content: string
  origin: DocumentOrigin
}

export interface SaveResult {
  name: string
  origin: DocumentOrigin
}

export interface ConflictInfo {
  message: string
  remoteModifiedTime: string | null
}

export interface StorageProvider {
  id: 'local' | 'drive'
  /** Show a picker. Resolves null when the user cancels. */
  open(): Promise<OpenedFile | null>
  /** Write to the existing origin. Throws when the origin cannot be written (caller falls back to saveAs). */
  save(origin: DocumentOrigin, content: string, name: string): Promise<SaveResult>
  /** Pick a new target. Resolves null when the user cancels. */
  saveAs(content: string, suggestedName: string): Promise<SaveResult | null>
  /** Optional: has the remote copy changed since we opened it? */
  checkConflict?(origin: DocumentOrigin): Promise<ConflictInfo | null>
}

export const FILE_EXTENSIONS = ['.mmd', '.mermaid', '.md', '.markdown', '.txt'] as const

export function isSupportedFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function isMarkdownFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}
