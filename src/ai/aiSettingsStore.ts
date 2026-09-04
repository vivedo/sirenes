import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { KeyStorageMode } from './keyStorage'

interface AiSettingsStore {
  selectedModelId: string | null
  favourites: string[]
  keyStorageMode: KeyStorageMode
  /** Keep the conversation when a new document is created. */
  pinConversation: boolean

  setSelectedModel: (id: string | null) => void
  toggleFavourite: (id: string) => void
  setKeyStorageMode: (mode: KeyStorageMode) => void
  setPinConversation: (pin: boolean) => void
}

export const AI_SETTINGS_STORAGE_KEY = 'sirenes:ai-settings'

export const useAiSettingsStore = create<AiSettingsStore>()(
  persist(
    (set) => ({
      selectedModelId: null,
      favourites: [],
      keyStorageMode: 'local',
      pinConversation: false,

      setSelectedModel: (selectedModelId) => set({ selectedModelId }),
      toggleFavourite: (id) =>
        set((s) => ({
          favourites: s.favourites.includes(id)
            ? s.favourites.filter((f) => f !== id)
            : [...s.favourites, id],
        })),
      setKeyStorageMode: (keyStorageMode) => set({ keyStorageMode }),
      setPinConversation: (pinConversation) => set({ pinConversation }),
    }),
    { name: AI_SETTINGS_STORAGE_KEY, version: 1 },
  ),
)
