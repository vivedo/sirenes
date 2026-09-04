import type { ThemeId } from '../themes/registry'
import type { DocumentOrigin, MarkdownWrapper } from '../storage/types'

export const MERMAID_THEMES = ['default', 'dark', 'forest', 'neutral', 'base'] as const
export type MermaidTheme = (typeof MERMAID_THEMES)[number]

export type UiTheme = 'system' | 'light' | 'dark'
export type Layout = 'split' | 'editor' | 'preview'

export interface RenderError {
  message: string
  /** 1-based line number in the source, when the parser reports one. */
  line: number | null
}

export type Engine = 'mermaid' | 'beautiful'

export interface RenderResult {
  /** Last successfully rendered SVG. Kept on screen while the source is invalid. */
  svg: string | null
  /** ASCII/Unicode rendering, only computed in ASCII preview mode. */
  ascii: string | null
  asciiError: string | null
  error: RenderError | null
  rendering: boolean
  /** Engine that produced the current svg. */
  engine: Engine
  /** Set when a beautiful theme was requested but the diagram type forced a Mermaid render. */
  fallback: string | null
}

export type UrlStatus = 'ok' | 'long' | 'too-long' | 'unsupported'

export interface DocumentState {
  /** Stable id for autosave and per-document AI history. */
  id: string
  source: string
  theme: ThemeId
  fileName: string | null
  /** Source at the time of the last save to a file or Drive. null when never saved. */
  savedSource: string | null
  /** Where Save writes. null for documents that never touched a file. */
  origin: DocumentOrigin | null
  /** Set when the document was opened from a Markdown file. */
  markdown: MarkdownWrapper | null
}

export interface ShareState {
  code: string
  theme: ThemeId
  view?: 'preview'
}
