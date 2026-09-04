import { create } from 'zustand'
import { getDriveConfig } from './config'
import { isSignedIn, onAuthChange } from './auth'

interface DriveStore {
  configured: boolean
  signedIn: boolean
  /** File id from a Drive "Open with" link, waiting for a user gesture to sign in and open. */
  pendingOpenId: string | null
  setSignedIn: (v: boolean) => void
  setPendingOpenId: (id: string | null) => void
}

export const useDriveStore = create<DriveStore>((set) => ({
  configured: getDriveConfig() !== null,
  signedIn: isSignedIn(),
  pendingOpenId: null,
  setSignedIn: (signedIn) => set({ signedIn }),
  setPendingOpenId: (pendingOpenId) => set({ pendingOpenId }),
}))

onAuthChange((signedIn) => useDriveStore.getState().setSignedIn(signedIn))
