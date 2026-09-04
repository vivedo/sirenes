import { EditorView } from '@codemirror/view'

/** Theme built entirely on CSS variables so light/dark follow the app tokens. */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--fg)',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.55',
  },
  '.cm-content': {
    caretColor: 'var(--fg)',
    padding: '8px 0',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    {
      backgroundColor: 'var(--selection) !important',
    },
  '.cm-activeLine': { backgroundColor: 'var(--bg-hover)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--fg-muted)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)' },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--selection)',
    outline: '1px solid var(--accent)',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--warn-bg)' },
  '.cm-panels': { backgroundColor: 'var(--bg-sunken)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-textfield': {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--fg)',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--fg)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--fg)',
  },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--danger)' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    borderBottom: '2px dotted var(--danger)',
  },
  '.cm-error-line': { backgroundColor: 'var(--danger-bg)' },
})
