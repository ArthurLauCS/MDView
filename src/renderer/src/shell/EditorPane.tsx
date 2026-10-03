import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Editor, type EditorHandle } from '../editor/Editor'
import { ContextMenu, type MenuAnchor } from './ContextMenu'
import { CommandPalette } from './CommandPalette'
import { renderMarkdown } from '../markdown/render'
import { resolveBinding } from '../actions/keymap'
import { codeAt } from '../actions/registry'
import { useDocuments } from '../state/documents'
import { settingsSnapshot, useSettings } from '../state/settings'
import type { ActionContext, ActionScope } from '../actions/types'
import './editorpane.css'

type ViewMode = 'source' | 'render' | 'split'

export function EditorPane(): JSX.Element {
  const { active } = useDocuments()
  const settings = useSettings()
  const [mode, setMode] = useState<ViewMode>('source')
  const [source, setSource] = useState(active?.body ?? '')
  const [dirty, setDirty] = useState(false)
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const editorRef = useRef<EditorHandle>(null)
  const saveTimer = useRef<number | null>(null)

  // A different document replaces the buffer outright.
  useEffect(() => {
    setSource(active?.body ?? '')
    setDirty(false)
  }, [active?.meta.id])

  const docPath = active?.meta.path ?? null

  const ctx: ActionContext = useMemo(() => {
    const handle = editorRef.current
    const selection = handle?.getSelection() ?? null
    return {
      source,
      cursor,
      selection,
      docPath,
      inCodeBlock: codeAt(source, cursor) !== null,
      inTable: false,
      tableColumn: null,
      replace: (start, end, text, caret) => handle?.replace(start, end, text, caret),
      toggleLinePrefix: () => undefined,
      toggleInline: () => undefined,
      insertBlock: (block) => {
        const at = handle?.getCursor() ?? 0
        const before = source.slice(0, at)
        const after = source.slice(at)
        const pad = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
        handle?.replace(0, source.length, before + pad + block + after, at + pad.length + block.length)
      },
      select: (start, end) => handle?.select(start, end),
      focus: () => handle?.focus(),
      toast: (message) => {
        setToast(message)
        window.setTimeout(() => setToast(null), 2200)
      }
    }
  }, [source, cursor, docPath])

  const availableScopes = useMemo<Set<string>>(() => {
    const scopes = new Set<string>(['global', 'app', 'document', 'insert', 'clipboard'])
    if (ctx.selection) {
      for (const s of ['selection', 'format', 'convert', 'find']) scopes.add(s)
    }
    if (ctx.inCodeBlock) scopes.add('codeblock')
    if (ctx.inTable) {
      scopes.add('table')
      scopes.add('tableColumn')
    }
    return scopes
  }, [ctx.selection, ctx.inCodeBlock, ctx.inTable])

  const persist = useCallback(
    (text: string) => {
      if (!docPath) return
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      // Debounced autosave: fast enough to survive a crash, slow enough that
      // a burst of typing is one write rather than two hundred.
      saveTimer.current = window.setTimeout(() => {
        void window.mdview.doc.write(docPath, text).then(() => setDirty(false))
      }, 700)
    },
    [docPath]
  )

  const update = useCallback(
    (next: string) => {
      setSource(next)
      setDirty(true)
      persist(next)
    },
    [persist]
  )

  const globalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const combo = e.ctrlKey || e.metaKey ? e : null

      if (e.key === 'F1') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (!combo) return

      // Ctrl+P and Ctrl+Shift+P both open the palette; the distinction only
      // changes the initial grouping, which lands with the full palette UI.
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (docPath) void window.mdview.doc.write(docPath, source).then(() => setDirty(false))
        return
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setMode((m) => (m === 'source' ? 'render' : m === 'render' ? 'split' : 'source'))
        return
      }

      const action = resolveBinding(e)
      if (!action) return
      if (!availableScopes.has(action.scope)) return
      e.preventDefault()
      void action.run(ctx)
    },
    [ctx, docPath, source, availableScopes]
  )

  useEffect(() => {
    window.addEventListener('keydown', globalKeyDown)
    return () => window.removeEventListener('keydown', globalKeyDown)
  }, [globalKeyDown])

  if (!active) return <></>

  const html = `${renderMarkdown(source)}`

  return (
    <div className="ep">
      <div className="ep__toolbar">
        <div className="ep__modes">
          {(['source', 'split', 'render'] as ViewMode[]).map((m) => (
            <button
              key={m}
              className={`ep__mode ${mode === m ? 'is-active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'source' ? '源码' : m === 'split' ? '分栏' : '阅读'}
            </button>
          ))}
        </div>
        <div className="ep__meta">
          {dirty && <span className="ep__dirty" title="有未保存的改动" />}
          <span className="ep__path" title={active.meta.path}>
            {active.meta.parentDir.replace(/.*[\\/]/, '')} / {active.meta.stem}
          </span>
        </div>
      </div>

      <div className={`ep__body ep__body--${mode}`}>
        {mode !== 'render' && (
          <Editor
            ref={editorRef}
            source={source}
            onChange={update}
            onCursorChange={setCursor}
            onContextMenu={(x, y) => setMenu({ x, y, target: { scope: menuScope(ctx) } })}
            readOnly={settings.readOnly}
            typewriter={settings.typewriterMode}
            highlightLine={settings.highlightCurrentLine}
          />
        )}
        {mode !== 'source' && (
          <div className="ep__preview">
            <article className="md" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>

      <ContextMenu anchor={menu} ctx={ctx} onClose={() => setMenu(null)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ctx={ctx}
        availableScopes={availableScopes}
      />
      {toast && <div className="ep__toast">{toast}</div>}
    </div>
  )
}

function menuScope(ctx: ActionContext): ActionScope {
  if (ctx.inCodeBlock) return 'codeblock'
  if (ctx.inTable) return 'table'
  if (ctx.selection) return 'selection'
  return 'document'
}

export { settingsSnapshot }
