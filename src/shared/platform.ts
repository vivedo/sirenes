export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')

/** Human-readable modifier for shortcut hints. */
export const modKey = isMac ? '⌘' : 'Ctrl'
