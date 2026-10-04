import { useEffect, useRef, useState } from 'react'
import { TitleBar } from './shell/TitleBar'
import { Sidebar } from './shell/Sidebar'
import { Welcome } from './shell/Welcome'
import { EditorPane } from './shell/EditorPane'
import { HistoryDock } from './history/HistoryPanel'
import { resolveBinding } from './actions/keymap'
import { CommandPalette } from './shell/CommandPalette'
import { PanelHost } from './panels/PanelHost'
import { useDocuments } from './state/documents'
import { applySettings, observeSettings, patchSettings, useSettings } from './state/settings'
import { useWorkspace } from './state/workspace'
import { editorContext, useEditorContext } from './state/editor-context'
import { closePanel, usePanel } from './state/ui'
import { useSessionBoot, touchSession } from './state/session'
import './shell/sidepanel.css'

export function App(): JSX.Element {
  const settings = useSettings()
  const workspace = useWorkspace()
  const { active, key: documentKey, error: documentError } = useDocuments()
  const { ctx, scopes } = useEditorContext()
  const panel = usePanel()
  const boot = useSessionBoot()
  const [error, setError] = useState<string | null>(null)
  const pressedActions = useRef(new Set<string>())

  useEffect(() => {
    const root = document.documentElement
    const update = (event: KeyboardEvent | MouseEvent): void => {
      root.classList.toggle('is-link-navigation', event.ctrlKey || event.metaKey)
    }
    const reset = (): void => root.classList.remove('is-link-navigation')
    window.addEventListener('keydown', update, true)
    window.addEventListener('keyup', update, true)
    window.addEventListener('mousemove', update, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', update, true)
      window.removeEventListener('keyup', update, true)
      window.removeEventListener('mousemove', update, true)
      window.removeEventListener('blur', reset)
      reset()
    }
  }, [])

  /** Keep the session pointed at whatever is in front. */
  useEffect(() => {
    if (!active) return
    touchSession({ activeDoc: active.meta.path || null, openDocs: active.meta.path ? [active.meta.path] : [] })
  }, [active?.meta.path])

  useEffect(() => {
    if (workspace.info) touchSession({ workspaceRoot: workspace.info.rootPath })
  }, [workspace.info?.rootPath])

  /**
   * The palette and every panel live here rather than inside the editor pane,
   * so they work on the welcome screen too. Ctrl+P opening nothing until a
   * document existed was a real bug.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const action = resolveBinding(e)
      if (!action) return
      // Some Windows IMEs consume a shortcut's keydown but still deliver keyup.
      // Keep this across renders so opening a panel cannot run the action twice.
      if (e.type === 'keydown') pressedActions.current.add(action.id)
      // A newly opened window can receive the release of the key that created it.
      else if (pressedActions.current.delete(action.id) || action.id === 'document.new' || action.id === 'document.open' || !(e.ctrlKey || e.altKey || e.metaKey)) return
      if (e.defaultPrevented || e.isComposing || e.repeat) return
      const ctx = editorContext()
      const target = e.target as HTMLElement
      const image = target instanceof HTMLImageElement && target.closest('.live-rendered') ? target : null
      const inScope = action.scope === 'table' || action.scope === 'tableColumn' ? ctx.inTable
        : action.scope === 'codeblock' ? ctx.inCodeBlock : action.scope === 'find' ? !!ctx.selection
        : action.scope === 'image' ? !!image : scopes.has(action.scope)
      if (!inScope || action.enabled?.(ctx) === false) return
      const appAction = ['app', 'global'].includes(action.scope)
      if (!appAction && panel) {
        if (target.closest('.editor')) { e.preventDefault(); e.stopPropagation() }
        return
      }
      if (!appAction && target.closest('input, textarea, [contenteditable]') && !target.closest('.editor')) return
      e.preventDefault()
      e.stopPropagation()
      void action.run(image ? { ...ctx, fullscreenImage: () => { void image.requestFullscreen() } } : ctx)
      // Escape is deliberately not handled here — PanelHost owns dismissal
      // for the panels, and the palette owns its own. Handling it in both
      // places meant two handlers racing on the same keystroke.
    }
    // App shortcuts must win over the focused editor or settings input.
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    const clearPressed = (): void => pressedActions.current.clear()
    window.addEventListener('blur', clearPressed)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      window.removeEventListener('blur', clearPressed)
    }
  }, [ctx, scopes, panel])

  useEffect(() => {
    void applySettings()
    return observeSettings()
  }, [])

  useEffect(() => {
    if (!panel) ctx.focus()
  }, [panel])

  /**
   * A sidebar that is a fixed column on a wide window is an overlay on a
   * narrow one, so the same "visible" flag cannot mean both. Collapse it on
   * the way down and restore it on the way back up, remembering which state
   * the user actually chose.
   */
  useEffect(() => {
    const NARROW = 900
    let userChoice = settings.sidebarVisible

    const onResize = (): void => {
      const narrow = window.innerWidth <= NARROW
      if (narrow && userChoice) {
        userChoice = false
        void patchSettings({ sidebarVisible: false })
      } else if (!narrow && !userChoice) {
        userChoice = true
        void patchSettings({ sidebarVisible: true })
      }
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // Intentionally keyed on nothing: `userChoice` must not reset per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.lang = settings.language
    root.dataset.theme = settings.theme === 'light' ? 'light' : 'dark'
    root.dataset.motion = settings.motion
    root.style.setProperty('--reading-size', `${settings.fontSize}px`)
    root.style.setProperty('--page-margin-left', `${settings.pageMarginLeft}%`)
    root.style.setProperty('--page-margin-right', `${settings.pageMarginRight}%`)
    root.style.setProperty('--sidebar-w', `${settings.sidebarWidth}px`)
    root.style.setProperty('--history-w', `${settings.historyWidth}px`)
    root.style.setProperty('--editor-font-size', `${settings.codeFontSize ?? 14}px`)
    root.style.setProperty('--editor-line-height', String(settings.lineHeight ?? 1.7))
    root.style.setProperty('--editor-caret-shape', settings.cursorStyle ?? 'bar')
    root.style.setProperty('--editor-tab-size', String(settings.tabSize ?? 2))
    for (const [name, font] of [['ui', settings.fontUi], ['read', settings.fontRead], ['code', settings.fontCode], ['display', settings.fontDisplay]]) {
      if (font) root.style.setProperty(`--font-${name}`, `${name === 'code' ? '' : '"MDView Latin", '}${JSON.stringify(font)}, var(--font-${name}-default)`)
      else root.style.removeProperty(`--font-${name}`)
    }

    // The accent is one value to the user and five tokens to the stylesheet.
    // Deriving the rest here keeps a user's colour from leaving hover and
    // selection in the built-in terracotta.
    const accent = settings.accentOverride
    if (accent && CSS.supports('color', accent)) {
      root.style.setProperty('--accent', accent)
      root.style.setProperty('--accent-hover', `color-mix(in srgb, ${accent} 88%, white)`)
      root.style.setProperty('--accent-press', `color-mix(in srgb, ${accent} 88%, black)`)
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 16%, transparent)`)
      root.style.setProperty('--accent-line', `color-mix(in srgb, ${accent} 34%, transparent)`)
    } else {
      for (const token of ['--accent', '--accent-hover', '--accent-press', '--accent-soft', '--accent-line']) {
        root.style.removeProperty(token)
      }
    }
  }, [
    settings.language,
    settings.theme,
    settings.motion,
    settings.fontSize,
    settings.fontUi,
    settings.fontRead,
    settings.fontCode,
    settings.fontDisplay,
    settings.pageMarginLeft,
    settings.pageMarginRight,
    settings.sidebarWidth,
    settings.historyWidth,
    settings.codeFontSize,
    settings.lineHeight,
    settings.cursorStyle,
    settings.tabSize,
    settings.accentOverride
  ])

  const openFolder = async (): Promise<void> => {
    try {
      await workspace.openDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="app-root">
      <TitleBar />
      {(documentError || error) && <div className="app-error" role="alert">{documentError || error}</div>}
      <div className="app-body">
        {settings.sidebarVisible && <Sidebar />}
        {!boot.booted ? (
          // Hold the first paint until the session is read — rendering the
          // welcome screen and then swapping it out would flash.
          <main className="doc doc--center" />
        ) : active ? (
          <EditorPane key={documentKey} />
        ) : (
          <Welcome onOpenFolder={openFolder} />
        )}
        <HistoryDock />
      </div>

      {/* Overlays sit at the top level so they are reachable whatever is
          on screen — including with no document open at all. */}
      <CommandPalette
        open={panel === 'palette'}
        onClose={closePanel}
        ctx={ctx}
        availableScopes={scopes}
      />
      <PanelHost />
    </div>
  )
}
