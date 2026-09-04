export const MERMAID_THEMES = ['default', 'dark', 'forest', 'neutral', 'base'] as const
export type MermaidTheme = (typeof MERMAID_THEMES)[number]

export type UiTheme = 'system' | 'light' | 'dark'
export type Layout = 'split' | 'editor' | 'preview'

export interface RenderError {
  message: string
  /** 1-based line number in the source, when the parser reports one. */
  line: number | null
}

export interface RenderResult {
  /** Last successfully rendered SVG. Kept on screen while the source is invalid. */
  svg: string | null
  error: RenderError | null
  rendering: boolean
}

export type UrlStatus = 'ok' | 'long' | 'too-long' | 'unsupported'

export interface DocumentState {
  /** Stable id for autosave and per-document AI history. */
  id: string
  source: string
  mermaidTheme: MermaidTheme
  fileName: string | null
  /** Source at the time of the last save to a file or Drive. null when never saved. */
  savedSource: string | null
}

export interface ShareState {
  code: string
  mermaidTheme: MermaidTheme
  view?: 'preview'
}
