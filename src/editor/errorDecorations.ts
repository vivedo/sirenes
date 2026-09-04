import { StateEffect, StateField, type TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { setDiagnostics } from '@codemirror/lint'
import type { RenderError } from '../store/types'

/** Effect that sets (or clears with null) the highlighted error line. */
export const setErrorLine = StateEffect.define<number | null>()

const errorLineDeco = Decoration.line({ class: 'cm-error-line' })

export const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setErrorLine)) {
        if (e.value === null) return Decoration.none
        const lineNo = Math.min(Math.max(1, e.value), tr.state.doc.lines)
        const line = tr.state.doc.line(lineNo)
        return Decoration.set([errorLineDeco.range(line.from)])
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** setDiagnostics returns its own effects; merge ours in instead of overwriting them. */
function withEffects(spec: TransactionSpec, ...extra: StateEffect<unknown>[]): TransactionSpec {
  const existing = spec.effects ? (Array.isArray(spec.effects) ? spec.effects : [spec.effects]) : []
  return { ...spec, effects: [...existing, ...extra] }
}

/** Push the current render error into the editor as a lint diagnostic and a line highlight. */
export function applyRenderError(view: EditorView, error: RenderError | null) {
  if (!error) {
    view.dispatch(withEffects(setDiagnostics(view.state, []), setErrorLine.of(null)))
    return
  }
  const lineNo = Math.min(Math.max(1, error.line ?? 1), view.state.doc.lines)
  const line = view.state.doc.line(lineNo)
  const diagnostics = setDiagnostics(view.state, [
    { from: line.from, to: line.to, severity: 'error', message: error.message },
  ])
  view.dispatch(withEffects(diagnostics, setErrorLine.of(error.line)))
}
