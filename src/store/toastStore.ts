import { create } from 'zustand'

export type ToastKind = 'info' | 'error' | 'warn'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind, ttlMs?: number, action?: ToastAction) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, kind = 'info', ttlMs = 3500, action) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, action }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttlMs)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  info: (m: string) => useToastStore.getState().push(m, 'info'),
  warn: (m: string) => useToastStore.getState().push(m, 'warn', 5000),
  error: (m: string) => useToastStore.getState().push(m, 'error', 6000),
  /** Info toast with an action button, e.g. Undo. Stays longer so the user can react. */
  action: (m: string, label: string, onClick: () => void) =>
    useToastStore.getState().push(m, 'info', 8000, { label, onClick }),
}
