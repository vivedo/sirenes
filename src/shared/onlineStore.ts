import { create } from 'zustand'

interface OnlineStore {
  online: boolean
}

export const useOnlineStore = create<OnlineStore>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}))

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useOnlineStore.setState({ online: true }))
  window.addEventListener('offline', () => useOnlineStore.setState({ online: false }))
}
