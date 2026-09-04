import { modKey } from '../shared/platform'

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [modKey, 'S'], label: 'Save' },
  { keys: [modKey, '⇧', 'S'], label: 'Save as…' },
  { keys: [modKey, 'O'], label: 'Open file…' },
  { keys: [modKey, 'N'], label: 'New blank diagram' },
  { keys: [modKey, '⇧', 'A'], label: 'Toggle AI panel' },
  { keys: [modKey, '⇧', 'F'], label: 'Format source' },
  { keys: [modKey, '⇧', 'L'], label: 'Copy share link' },
  { keys: [modKey, '1'], label: 'Editor only' },
  { keys: [modKey, '2'], label: 'Split view' },
  { keys: [modKey, '3'], label: 'Preview only' },
  { keys: [modKey, 'F'], label: 'Find in editor' },
  { keys: [modKey, 'Z'], label: 'Undo' },
  { keys: ['?'], label: 'Show this dialog' },
]
