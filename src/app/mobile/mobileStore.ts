import { create } from 'zustand'

export type MobilePane = 'editor' | 'preview'

interface MobileStore {
  /** Which single pane is showing on a phone. Not persisted: the desktop layout setting is left alone. */
  pane: MobilePane
  setPane: (pane: MobilePane) => void
}

export const useMobileStore = create<MobileStore>((set) => ({
  pane: 'editor',
  setPane: (pane) => set({ pane }),
}))
