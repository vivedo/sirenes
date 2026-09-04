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
  /** AI panel width in px. */
  aiPanelWidth: number
  previewMode: PreviewMode
  /** In ASCII mode: plain +-| characters instead of Unicode box drawing. */
  asciiPlain: boolean
  /** Last Drive folder used for Save as; null means My Drive. */
  driveFolder: { id: string; name: string } | null

  setUiTheme: (theme: UiTheme) => void
  setLayout: (layout: Layout) => void
  setSplitRatio: (ratio: number) => void
  toggleAiPanel: (open?: boolean) => void
  setAiPanelWidth: (px: number) => void
  setPreviewMode: (mode: PreviewMode) => void
  setAsciiPlain: (plain: boolean) => void
  setDriveFolder: (folder: { id: string; name: string } | null) => void
}

export const SETTINGS_STORAGE_KEY = 'sirenes:settings'

export const AI_PANEL_MIN_WIDTH = 280
export const AI_PANEL_MAX_WIDTH = 900

/** Keep the panel usable and leave room for the editor and preview. */
export function clampAiPanelWidth(
  px: number,
  viewportWidth = typeof window === 'undefined' ? Infinity : window.innerWidth,
): number {
  const max = Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, viewportWidth * 0.6))
  return Math.round(Math.min(max, Math.max(AI_PANEL_MIN_WIDTH, px)))
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      uiTheme: 'system',
      layout: 'split',
      splitRatio: 0.45,
      aiPanelOpen: false,
      aiPanelWidth: 360,
      previewMode: 'svg',
      asciiPlain: false,
      driveFolder: null,

      setUiTheme: (uiTheme) => set({ uiTheme }),
      setLayout: (layout) => set({ layout }),
      setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.85, Math.max(0.15, ratio)) }),
      toggleAiPanel: (open) => set((s) => ({ aiPanelOpen: open ?? !s.aiPanelOpen })),
      setAiPanelWidth: (px) => set({ aiPanelWidth: clampAiPanelWidth(px) }),
      setPreviewMode: (previewMode) => set({ previewMode }),
      setAsciiPlain: (asciiPlain) => set({ asciiPlain }),
      setDriveFolder: (driveFolder) => set({ driveFolder }),
    }),
    { name: SETTINGS_STORAGE_KEY, version: 1 },
  ),
)
