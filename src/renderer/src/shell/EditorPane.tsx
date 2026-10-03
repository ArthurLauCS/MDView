import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Editor, type EditorHandle } from '../editor/Editor'
import { ContextMenu, type MenuAnchor } from './ContextMenu'
import { renderMarkdown } from '../markdown/render'
import { resolveDocumentAssets } from '../markdown/resolve-assets'
import { publishEditorContext } from '../state/editor-context'
import { clearLiveText, publishLiveText } from '../history/live-text'
import { closePanel, togglePanel, usePanel } from '../state/ui'
import { TableToolbar } from '../tableui/TableToolbar'
import { useTableEdit } from '../tableui/useTableEdit'
import { AssetPanel } from '../assets/AssetPanel'
import { insertFromClipboard, insertFromPaths } from '../assets/insert'
import { installDropTarget } from '../assets/drop'
import { resolveBinding } from '../actions/keymap'
import { codeAt } from '../actions/registry'
import { useDocuments } from '../state/documents'
import { settingsSnapshot, useSettings } from '../state/settings'
import type { ActionContext, ActionScope } from '../actions/types'
import type { Revision } from '@shared/types'
import './editorpane.css'

type ViewMode = 'source' | 'render' | 'split'

export function EditorPane(): JSX.Element {
  const { active } = useDocuments()
  const settings = useSettings()
  const [mode, setMode] = useState<ViewMode>('source')
  const [source, setSource] = useState(active?.body ?? '')
  /**
   * The live buffer, readable and writable from outside this component.
   *
   * The history panel needs the *unsaved* text to snapshot it and to restore
   * over it, and it is mounted above the editor. A ref keeps that seam narrow
   * — the alternative, threading a callback through the panel host, would
   * make the panel depend on the editor's whole state shape.
   */
  const sourceRef = useRef(source)
  sourceRef.current = source
  const [dirty, setDirty] = useState(false)
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const panel = usePanel()
  const [toast, setToast] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const editorRef = useRef<EditorHandle>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)

  // A different document replaces the buffer outright.
  useEffect(() => {
    setSource(active?.body ?? '')
    setDirty(false)
  }, [active?.meta.id])

  const docPath = active?.meta.path ?? null
  const tableEdit = useTableEdit(source, cursor)

  const ctx: ActionContext = useMemo(() => {
    const handle = editorRef.current
    const selection = handle?.getSelection() ?? null
    return {
      source,
      cursor,
      selection,
      docPath,
      inCodeBlock: codeAt(source, cursor) !== null,
      inTable: tableEdit.context !== null,
      tableColumn: tableEdit.cell?.col ?? null,
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
  }, [source, cursor, docPath, tableEdit.context, tableEdit.cell])

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

  // Hand the live editing context up to the overlays mounted above this pane.
  useEffect(() => {
    publishEditorContext(ctx, availableScopes)
    return () => publishEditorContext(null, new Set(['app', 'global']))
  }, [ctx, availableScopes])

  const persist = useCallback(
    (text: string, kind: Revision['kind'] = 'auto') => {
      if (!docPath) return
      if (saveTimer.current) window.clearTimeout(saveTimer.current)

      // A snapshot is still worth taking with autosave off: the user turned
      // off writing to their file, not the safety net.
      const snapshot = (): void => {
        const s = settingsSnapshot()
        if (!s.historyEnabled || !active) return
        void window.mdview.history
          .record(active.meta.id, text, kind)
          .then(() => undefined)
      }

      const s = settingsSnapshot()
      if (!s.autoSave) {
        // No disk write, but the history tick still runs on its own cadence.
        if (kind !== 'auto') snapshot()
        else saveTimer.current = window.setTimeout(snapshot, s.historyIntervalMs)
        return
      }

      // Debounced autosave: fast enough to survive a crash, slow enough that
      // a burst of typing is one write rather than two hundred.
      saveTimer.current = window.setTimeout(() => {
        void window.mdview.doc.write(docPath, text).then(() => setDirty(false))
        snapshot()
      }, s.autoSaveDelayMs)
    },
    [docPath, active]
  )

  /** Ctrl+S writes immediately and records a named point in the history. */
  const saveNow = useCallback(() => {
    if (!docPath) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    void window.mdview.doc.write(docPath, sourceRef.current).then(() => setDirty(false))
    if (settingsSnapshot().historyEnabled && active) {
      void window.mdview.history.record(active.meta.id, sourceRef.current, 'manual')
    }
  }, [docPath, active])

  const update = useCallback(
    (next: string) => {
      setSource(next)
      setDirty(true)
      persist(next)
    },
    [persist]
  )

  // Publish the buffer so the history panel can read it and write back over it.
  useEffect(() => {
    publishLiveText(
      () => sourceRef.current,
      (text) => update(text)
    )
    return () => clearLiveText()
  }, [update])

  /**
   * Pasting an image saves it beside the document and inserts a relative
   * link; pasting anything else falls through to the browser's own handling
   * so text, rich text and multi-line paste all behave normally.
   */
  /**
   * Accept images dropped anywhere on the pane. Text drags pass through
   * untouched — only an image payload is intercepted, which is what keeps
   * ordinary drag-and-drop inside the textarea working.
   */
  useEffect(() => {
    const el = paneRef.current
    if (!el || !docPath) return
    return installDropTarget(
      el,
      () => docPath,
      (files) => {
        const paths = files
          .map((f) => window.mdview.asset.pathForFile(f))
          .filter((p): p is string => p !== null)
        if (paths.length === 0) {
          setToast('这些文件无法定位到磁盘路径，请改用「插入图片」')
          window.setTimeout(() => setToast(null), 3000)
          return
        }
        void insertFromPaths(docPath, source, editorRef.current?.getCursor() ?? 0, null, paths).then(
          (res) => {
            setSource(res.markdown)
            setDirty(true)
            persist(res.markdown)
            editorRef.current?.focus()
          }
        )
      }
    )
  }, [docPath, source, persist])

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!docPath) return
      const hasImage = [...e.clipboardData.items].some((i) => i.type.startsWith('image/'))
      if (!hasImage) return
      e.preventDefault()
      const ta = e.currentTarget
      const selection =
        ta.selectionStart === ta.selectionEnd ? null : ta.value.slice(ta.selectionStart, ta.selectionEnd)
      void insertFromClipboard(docPath, source, ta.selectionStart, selection ?? undefined).then(
        (res) => {
          if (!res) return
          setSource(res.markdown)
          setDirty(true)
          persist(res.markdown)
          editorRef.current?.select(res.cursor, res.cursor)
        }
      )
    },
    [docPath, source, persist]
  )

  const globalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const combo = e.ctrlKey || e.metaKey ? e : null

      if (e.key === 'F1') {
        e.preventDefault()
        togglePanel('shortcuts')
        return
      }
      if (e.key === 'Escape' && panel) {
        e.preventDefault()
        closePanel()
        return
      }
      if (!combo) return

      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        togglePanel('palette')
        return
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        togglePanel('settings')
        return
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        togglePanel('export')
        return
      }
      // An overlay owns the keyboard while it is up; letting document
      // shortcuts through would edit the text behind a modal.
      if (panel) return
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveNow()
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
    [ctx, docPath, source, availableScopes, saveNow]
  )

  useEffect(() => {
    window.addEventListener('keydown', globalKeyDown)
    return () => window.removeEventListener('keydown', globalKeyDown)
  }, [globalKeyDown])

  if (!active) return <></>

  // Local images must be rewritten before they reach the DOM: a relative
  // `src` resolves against the app bundle, not against the document folder.
  const html = resolveDocumentAssets(
    renderMarkdown(source),
    docPath ? docPath.replace(/[\\/][^\\/]+$/, '') : null
  )

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

      <div className={`ep__body ep__body--${mode}`} ref={paneRef}>
        {mode !== 'render' && (
          <Editor
            ref={editorRef}
            source={source}
            onChange={update}
            onCursorChange={setCursor}
            onPaste={onPaste}
            onContextMenu={(x, y) => setMenu({ x, y, target: { scope: menuScope(ctx) } })}
            readOnly={settings.readOnly}
            typewriter={settings.typewriterMode}
            highlightLine={settings.highlightCurrentLine}
            spellCheck={settings.spellCheck}
            autoPair={settings.autoPair}
            smartLists={settings.smartLists}
          />
        )}
        {mode !== 'source' && (
          <div className="ep__preview">
            <article className="md" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}

        {/* The toolbar floats over the editor and only appears with a table
            under the caret, so it never competes with the text itself. */}
        {mode !== 'render' && (
          <TableToolbar
            edit={tableEdit}
            onApply={(text, at) => {
              update(text)
              editorRef.current?.select(at, at)
            }}
          />
        )}
      </div>

      {settings.outlineVisible && docPath && (
        <AssetPanel docPath={docPath} source={source} />
      )}

      <ContextMenu anchor={menu} ctx={ctx} onClose={() => setMenu(null)} />
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
