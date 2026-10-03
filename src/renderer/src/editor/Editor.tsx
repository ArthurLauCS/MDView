import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { highlightSource } from './highlight'
import { autoPair, continuationPrefix } from '../actions/markdown-ops'
import './editor.css'

export interface EditorHandle {
  getSource: () => string
  getCursor: () => number
  getSelection: () => { start: number; end: number } | null
  setSource: (text: string) => void
  replace: (start: number, end: number, text: string, cursor?: number) => void
  select: (start: number, end: number) => void
  focus: () => void
  /** Screenshot-friendly: the element a drop target should be attached to. */
  element: () => HTMLTextAreaElement | null
}

interface Props {
  source: string
  onChange: (next: string) => void
  onContextMenu: (x: number, y: number) => void
  onCursorChange?: (cursor: number) => void
  /** Image pastes are intercepted here; other pastes pass through untouched. */
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  /** Intercept keys before the editor handles them. Return true to consume. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  readOnly?: boolean
  typewriter?: boolean
  highlightLine?: boolean
  /** Editor behaviours the user can turn off individually. */
  spellCheck?: boolean
  autoPair?: boolean
  smartLists?: boolean
}

const LINE_HEIGHT = 1.7

/**
 * A textarea with a syntax-highlighted mirror painted underneath it.
 *
 * The textarea keeps its own text transparent and the caret visible, while a
 * `<pre>` renders the coloured copy. Both use identical metrics, so they stay
 * aligned through scrolling, wrapping and font changes without any sync code.
 * This is far cheaper than a full editor framework and keeps every native
 * behaviour — IME, undo, spellcheck, accessibility — intact, which matters
 * more here than bespoke key handling.
 */
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  {
    source,
    onChange,
    onContextMenu,
    onCursorChange,
    onPaste,
    onKeyDown,
    readOnly,
    typewriter,
    highlightLine,
    spellCheck,
    autoPair: pairingEnabled = true,
    smartLists = true
  },
  ref
) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState(0)

  const lines = useMemo(() => source.split('\n'), [source])
  const html = useMemo(() => highlightSource(source), [source])

  const { line, col } = useMemo(() => {
    const before = source.slice(0, cursor)
    const lineIndex = before.split('\n').length - 1
    const lineStart = before.lastIndexOf('\n') + 1
    return { line: lineIndex, col: cursor - lineStart }
  }, [source, cursor])

  /** Keep the mirror and gutter glued to the textarea's own scroll offset. */
  const syncScroll = useCallback((): void => {
    const ta = taRef.current
    if (!ta) return
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop
      preRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop
  }, [])

  const syncCursor = useCallback((): void => {
    const ta = taRef.current
    if (!ta) return
    setCursor(ta.selectionStart)
    onCursorChange?.(ta.selectionStart)
  }, [onCursorChange])

  useImperativeHandle(
    ref,
    () => ({
      getSource: () => taRef.current?.value ?? source,
      getCursor: () => taRef.current?.selectionStart ?? 0,
      getSelection: () => {
        const ta = taRef.current
        if (!ta || ta.selectionStart === ta.selectionEnd) return null
        return { start: ta.selectionStart, end: ta.selectionEnd }
      },
      setSource: (text) => {
        onChange(text)
      },
      replace: (start, end, text, at) => {
        const ta = taRef.current
        if (!ta) return
        const next = ta.value.slice(0, start) + text + ta.value.slice(end)
        onChange(next)
        const caret = at ?? start + text.length
        // The DOM value updates on the next render, so restore after paint.
        requestAnimationFrame(() => {
          ta.setSelectionRange(caret, caret)
          syncCursor()
          if (typewriter) centreLine(ta)
        })
      },
      select: (start, end) => {
        taRef.current?.focus()
        taRef.current?.setSelectionRange(start, end)
        syncCursor()
      },
      focus: () => taRef.current?.focus(),
      element: () => taRef.current
    }),
    [source, onChange, syncCursor, typewriter]
  )

  useEffect(() => {
    if (typewriter && taRef.current) centreLine(taRef.current)
  }, [cursor, typewriter])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (onKeyDown?.(e)) return
    const ta = e.currentTarget

    // Smart list continuation. Done here rather than in the action registry
    // because it depends on browser-native Enter handling.
    if (smartLists && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1
      const current = ta.value.slice(lineStart, ta.selectionStart)
      const prefix = continuationPrefix(current)
      if (prefix) {
        e.preventDefault()
        const insert = `\n${prefix}`
        const next = ta.value.slice(0, ta.selectionStart) + insert + ta.value.slice(ta.selectionEnd)
        onChange(next)
        const caret = ta.selectionStart + insert.length
        requestAnimationFrame(() => {
          ta.setSelectionRange(caret, caret)
          syncCursor()
        })
        return
      }
      if (/^\s*(```|~~~)/.test(current) && ta.selectionStart === ta.selectionEnd) {
        e.preventDefault()
        const insert = `\n\n${current.match(/^\s*/)?.[0] ?? ''}\`\`\`\n`
        const next = ta.value.slice(0, ta.selectionStart) + insert + ta.value.slice(ta.selectionEnd)
        onChange(next)
        const caret = ta.selectionStart + 1
        requestAnimationFrame(() => {
          ta.setSelectionRange(caret, caret)
          syncCursor()
        })
        return
      }
    }

    // Auto-pairing, but never inside a code fence — there the user wants the
    // literal character, and the closing-bracket skip would fight them.
    if (pairingEnabled && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !readOnly) {
      const inFence = isInsideFence(ta.value, ta.selectionStart)
      if (!inFence) {
        const sel =
          ta.selectionStart === ta.selectionEnd
            ? null
            : { start: ta.selectionStart, end: ta.selectionEnd }
        const result = autoPair(ta.value, ta.selectionStart, sel, e.key)
        if (result === 'skip-close') {
          e.preventDefault()
          const next = ta.selectionStart + 1
          requestAnimationFrame(() => {
            ta.setSelectionRange(next, next)
            syncCursor()
          })
          return
        }
        if (result) {
          e.preventDefault()
          onChange(result.text)
          requestAnimationFrame(() => {
            if (result.selection) ta.setSelectionRange(result.selection[0], result.selection[1])
            else ta.setSelectionRange(result.cursor, result.cursor)
            syncCursor()
          })
        }
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const start = ta.selectionStart
      const end = ta.selectionEnd
      if (start === end) {
        const next = ta.value.slice(0, start) + '  ' + ta.value.slice(end)
        onChange(next)
        requestAnimationFrame(() => {
          ta.setSelectionRange(start + 2, start + 2)
          syncCursor()
        })
      } else {
        const from = ta.value.lastIndexOf('\n', start - 1) + 1
        const block = ta.value.slice(from, end)
        const shifted = e.shiftKey
          ? block.replace(/^ {1,2}/gm, '')
          : block.replace(/^/gm, '  ')
        onChange(ta.value.slice(0, from) + shifted + ta.value.slice(end))
        requestAnimationFrame(() => {
          ta.setSelectionRange(from, from + shifted.length)
          syncCursor()
        })
      }
    }
  }

  return (
    <div className="editor">
      <div className="editor__gutter" ref={gutterRef} aria-hidden>
        {lines.map((_, i) => (
          <span key={i} className={`editor__lineno ${i === line ? 'is-current' : ''}`}>
            {i + 1}
          </span>
        ))}
      </div>

      <div className="editor__pane">
        <pre className="editor__mirror" ref={preRef} aria-hidden>
          <code dangerouslySetInnerHTML={{ __html: html + '\n' }} />
        </pre>
        <textarea
          ref={taRef}
          className={`editor__input ${highlightLine ? 'is-line-highlight' : ''}`}
          // The current-line band is painted by CSS at this offset, which keeps
          // it in the textarea's own scroll space instead of a separate layer.
          style={highlightLine ? ({ '--caret-line': line } as React.CSSProperties) : undefined}
          value={source}
          readOnly={readOnly}
          spellCheck={spellCheck ?? false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          onSelect={syncCursor}
          onClick={syncCursor}
          onKeyUp={syncCursor}
          onContextMenu={(e) => {
            e.preventDefault()
            onContextMenu(e.clientX, e.clientY)
          }}
          aria-label="Markdown 源码"
        />
      </div>

      <div className="editor__status">
        <span>
          第 {line + 1} 行，第 {col + 1} 列
        </span>
        <span className="editor__status-sep" />
        <span>{source.length} 字符</span>
      </div>
    </div>
  )
})

function centreLine(ta: HTMLTextAreaElement): void {
  const before = ta.value.slice(0, ta.selectionStart)
  const lineIndex = before.split('\n').length - 1
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 24
  const target = lineIndex * lineHeight - ta.clientHeight / 2 + lineHeight
  // Direct assignment, never smooth scrolling — smooth fights every keystroke.
  ta.scrollTop = Math.max(0, target)
}

/** Cheap fence toggle scan; a full parse would be wasteful per keystroke. */
function isInsideFence(src: string, offset: number): boolean {
  const before = src.slice(0, offset)
  const fences = before.match(/^```/gm)
  return (fences?.length ?? 0) % 2 === 1
}

export { LINE_HEIGHT }
