import { create } from 'zustand'

export type ToastKind = 'info' | 'error' | 'warn'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind, ttlMs?: number) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, kind = 'info', ttlMs = 3500) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttlMs)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  info: (m: string) => useToastStore.getState().push(m, 'info'),
  warn: (m: string) => useToastStore.getState().push(m, 'warn', 5000),
  error: (m: string) => useToastStore.getState().push(m, 'error', 6000),
}
