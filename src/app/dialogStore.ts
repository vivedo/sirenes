import { create } from 'zustand'

export interface ChoiceOption {
  id: string
  label: string
  primary?: boolean
  danger?: boolean
}

export interface Choice {
  title: string
  message: string
  options: ChoiceOption[]
}

interface DialogStore {
  current: (Choice & { resolve: (id: string | null) => void }) | null
  ask: (choice: Choice) => Promise<string | null>
  answer: (id: string | null) => void
}

/** Promise-based multi-choice dialog, for flows like "Overwrite / Save as copy / Cancel". */
export const useDialogStore = create<DialogStore>((set, get) => ({
  current: null,
  ask: (choice) =>
    new Promise((resolve) => {
      get().current?.resolve(null)
      set({ current: { ...choice, resolve } })
    }),
  answer: (id) => {
    const c = get().current
    set({ current: null })
    c?.resolve(id)
  },
}))

export const ask = (choice: Choice) => useDialogStore.getState().ask(choice)
