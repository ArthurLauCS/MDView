import { useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, placeholder, scrollPastEnd } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory, undo, redo } from '@codemirror/commands'
import { markdownKeymap } from '@codemirror/lang-markdown'
import { indentUnit, syntaxTree } from '@codemirror/language'
import { autoPair } from '../actions/markdown-ops'
import { focusTableCell, livePreview, liveMarkdown } from './live-preview'
import { PageMargins } from './PageMargins'
import './editor.css'

export interface EditorHandle {
  getSource: () => string
  getCursor: () => number
  getSelection: () => { start: number; end: number } | null
  setSource: (text: string) => void
  replace: (start: number, end: number, text: string, cursor?: number) => void
  select: (start: number, end: number) => void
  jump: (offset: number) => void
  focus: () => void
  undo: () => void
  redo: () => void
  element: () => HTMLElement | null
}

interface Props {
  source: string
  docPath: string
  onChange: (next: string) => void
  onContextMenu: (x: number, y: number) => void
  onCursorChange?: (cursor: number) => void
  onPaste?: (e: ClipboardEvent) => void
  readOnly?: boolean
  typewriter?: boolean
  highlightLine?: boolean
  spellCheck?: boolean
  autoPair?: boolean
  smartLists?: boolean
  tabSize?: number
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const current = useRef(props)
  current.current = props
  const config = useRef(new Compartment())
  const documentConfig = useRef(new Compartment())
  const [cursor, setCursor] = useState(0)

  const configure = () => [
    EditorState.tabSize.of(current.current.tabSize ?? 2),
    indentUnit.of(' '.repeat(current.current.tabSize ?? 2)),
    EditorState.readOnly.of(!!current.current.readOnly),
    EditorView.editable.of(!current.current.readOnly),
    EditorView.contentAttributes.of({
      class: 'md',
      'aria-label': 'Markdown 文档',
      spellcheck: String(!!current.current.spellCheck)
    }),
    current.current.highlightLine ? highlightActiveLine() : [],
    current.current.smartLists ? keymap.of(markdownKeymap) : []
  ]

  const select = (start: number, end: number): void => {
    const view = viewRef.current
    if (!view) return
    start = Math.min(start, view.state.doc.length)
    end = Math.min(end, view.state.doc.length)
    if (focusTableCell(view, start, end)) return
    view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true })
    view.focus()
  }

  useImperativeHandle(ref, () => ({
    getSource: () => viewRef.current?.state.doc.toString() ?? current.current.source,
    getCursor: () => viewRef.current?.state.selection.main.from ?? 0,
    getSelection: () => {
      const range = viewRef.current?.state.selection.main
      return range && !range.empty ? { start: range.from, end: range.to } : null
    },
    setSource: (text) => {
      const view = viewRef.current
      if (view && !view.state.readOnly) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: isolateHistory.of('full') })
    },
    replace: (start, end, text, at) => {
      const view = viewRef.current
      if (!view || view.state.readOnly) return
      const cursor = at ?? start + text.length
      view.dispatch({ changes: { from: start, to: end, insert: text }, selection: { anchor: cursor }, userEvent: 'input' })
      select(cursor, cursor)
    },
    select,
    jump: (offset) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: 'start', yMargin: 16 }) })
      view.focus()
    },
    focus: () => viewRef.current?.focus(),
    undo: () => { if (viewRef.current && !viewRef.current.state.readOnly) undo(viewRef.current) },
    redo: () => { if (viewRef.current && !viewRef.current.state.readOnly) redo(viewRef.current) },
    element: () => viewRef.current?.contentDOM ?? null
  }), [])

  useLayoutEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: current.current.source,
        extensions: [
          liveMarkdown(),
          history(),
          config.current.of(configure()),
          keymap.of([...historyKeymap, indentWithTab, ...defaultKeymap]),
          EditorView.lineWrapping,
          scrollPastEnd(),
          documentConfig.current.of(livePreview(current.current.docPath ? current.current.docPath.replace(/[\\/][^\\/]+$/, '') : null)),
          placeholder('从这里开始写作…'),
          EditorView.domEventHandlers({
            contextmenu(event) {
              event.preventDefault()
              current.current.onContextMenu(event.clientX, event.clientY)
              return true
            },
            paste(event) {
              if (current.current.readOnly) return true
              current.current.onPaste?.(event)
              return event.defaultPrevented
            }
          }),
          EditorView.inputHandler.of((view, from, to, text) => {
            if (!current.current.autoPair || view.composing || text.length !== 1) return false
            for (let node = syntaxTree(view.state).resolveInner(from, -1); node; node = node.parent!) {
              if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false
            }
            const source = view.state.doc.toString()
            const result = autoPair(source, from, from === to ? null : { start: from, end: to }, text)
            if (!result) return false
            if (result === 'skip-close') view.dispatch({ selection: { anchor: from + 1 } })
            else view.dispatch({
              changes: { from: 0, to: source.length, insert: result.text },
              selection: { anchor: result.selection?.[0] ?? result.cursor, head: result.selection?.[1] ?? result.cursor },
              userEvent: 'input.type'
            })
            return true
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.every((tr) => tr.annotation(Transaction.addToHistory) === false)) {
              current.current.onChange(update.state.doc.toString())
            }
            if (update.docChanged || update.selectionSet) {
              const offset = update.state.selection.main.from
              setCursor(offset)
              current.current.onCursorChange?.(offset)
              if (current.current.typewriter && update.view.hasFocus && update.docChanged) {
                requestAnimationFrame(() => {
                  if (viewRef.current === view) view.dispatch({ effects: EditorView.scrollIntoView(offset, { y: 'center' }) })
                })
              }
            }
          })
        ]
      })
    })
    viewRef.current = view
    view.focus()
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: documentConfig.current.reconfigure(livePreview(props.docPath ? props.docPath.replace(/[\\/][^\\/]+$/, '') : null)) })
  }, [props.docPath])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: config.current.reconfigure(configure()) })
  }, [props.readOnly, props.highlightLine, props.spellCheck, props.smartLists, props.tabSize])

  useEffect(() => {
    const view = viewRef.current
    if (!view || props.source === view.state.doc.toString()) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.source },
      annotations: Transaction.addToHistory.of(false)
    })
  }, [props.source])

  const before = props.source.slice(0, cursor)
  return (
    <div className="editor">
      <div className="editor__surface">
        <div className="editor__mount" ref={host} />
        <PageMargins />
      </div>
      <div className="editor__status">
        <span>第 {before.split('\n').length} 行</span>
        <span>{props.source.length} 字符</span>
        <span>{props.readOnly ? '只读' : '直接编辑'}</span>
      </div>
    </div>
  )
})
