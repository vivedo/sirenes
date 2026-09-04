import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout, UiTheme } from './types'

export type PreviewMode = 'svg' | 'ascii'

interface SettingsStore {
  uiTheme: UiTheme
  layout: Layout
  /** Editor share of the split pane, 0..1. */
  splitRatio: number
  aiPanelOpen: boolean
  previewMode: PreviewMode
  /** In ASCII mode: plain +-| characters instead of Unicode box drawing. */
  asciiPlain: boolean

  setUiTheme: (theme: UiTheme) => void
  setLayout: (layout: Layout) => void
  setSplitRatio: (ratio: number) => void
  toggleAiPanel: (open?: boolean) => void
  setPreviewMode: (mode: PreviewMode) => void
  setAsciiPlain: (plain: boolean) => void
}

export const SETTINGS_STORAGE_KEY = 'sirenes:settings'

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      uiTheme: 'system',
      layout: 'split',
      splitRatio: 0.45,
      aiPanelOpen: false,
      previewMode: 'svg',
      asciiPlain: false,

      setUiTheme: (uiTheme) => set({ uiTheme }),
      setLayout: (layout) => set({ layout }),
      setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.85, Math.max(0.15, ratio)) }),
      toggleAiPanel: (open) => set((s) => ({ aiPanelOpen: open ?? !s.aiPanelOpen })),
      setPreviewMode: (previewMode) => set({ previewMode }),
      setAsciiPlain: (asciiPlain) => set({ asciiPlain }),
    }),
    { name: SETTINGS_STORAGE_KEY, version: 1 },
  ),
)
