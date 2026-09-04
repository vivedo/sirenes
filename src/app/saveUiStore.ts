import { create } from 'zustand'

export type SaveDestination = 'local' | 'drive'

interface SaveUiStore {
  open: boolean
  destination: SaveDestination
  name: string
  busy: boolean
  error: string | null
  /** Guest "Save a copy": do not adopt the new file as the document origin. */
  copyOnly: boolean
  show: (destination: SaveDestination, name: string, copyOnly?: boolean) => void
  hide: () => void
  setDestination: (d: SaveDestination) => void
  setName: (name: string) => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
}

/** State of the in-app "Save as" panel. Replaces window.prompt for file names. */
export const useSaveUiStore = create<SaveUiStore>((set) => ({
  open: false,
  destination: 'local',
  name: '',
  busy: false,
  error: null,
  copyOnly: false,
  show: (destination, name, copyOnly = false) =>
    set({ open: true, destination, name, busy: false, error: null, copyOnly }),
  hide: () => set({ open: false, busy: false, error: null }),
  setDestination: (destination) => set({ destination, error: null }),
  setName: (name) => set({ name, error: null }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error, busy: false }),
}))
