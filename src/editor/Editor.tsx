import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { lintGutter } from '@codemirror/lint'
import { useDocumentStore } from '../store/documentStore'
import { mermaid } from './mermaidLanguage'
import { editorTheme } from './editorTheme'
import { applyRenderError, errorLineField } from './errorDecorations'
import { setEditorView } from './editorRegistry'
import { collabCompartment, historyCompartment, readOnlyCompartment } from './compartments'
import { useCollabStore } from '../collab/collabStore'
import './Editor.css'

export function Editor() {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!host.current) return
    const store = useDocumentStore.getState()

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: store.doc.source,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          historyCompartment.of([history(), keymap.of(historyKeymap)]),
          collabCompartment.of([]),
          readOnlyCompartment.of([]),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          lintGutter(),
          errorLineField,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, indentWithTab]),
          mermaid(),
          editorTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              useDocumentStore.getState().setSource(update.state.doc.toString())
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    setEditorView(view)

    // External changes (template, URL load, AI accept) flow store -> editor.
    const unsubSource = useDocumentStore.subscribe((s, prev) => {
      if (s.doc.source === prev.doc.source && s.doc.id === prev.doc.id) return
      // In a live session the shared text drives the editor; a store push would be treated by
      // y-codemirror as a local edit and echoed to every peer.
      if (useCollabStore.getState().session) return
      const current = view.state.doc.toString()
      if (current === s.doc.source) return
      view.dispatch({
        changes: { from: 0, to: current.length, insert: s.doc.source },
        // A whole new document should not be undoable back into the old one.
        annotations: s.doc.id !== prev.doc.id ? [] : undefined,
      })
    })

    let lastError = useDocumentStore.getState().render.error
    applyRenderError(view, lastError)
    const unsubError = useDocumentStore.subscribe((s) => {
      if (s.render.error === lastError) return
      lastError = s.render.error
      applyRenderError(view, lastError)
    })

    return () => {
      unsubSource()
      unsubError()
      view.destroy()
      setEditorView(null)
      viewRef.current = null
    }
  }, [])

  return <div className="editor" ref={host} data-testid="editor" />
}
