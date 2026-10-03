import { useEffect, useState } from 'react'
import { TitleBar } from './shell/TitleBar'
import { Sidebar } from './shell/Sidebar'
import { Welcome } from './shell/Welcome'
import { EditorPane } from './shell/EditorPane'
import { CommandPalette } from './shell/CommandPalette'
import { PanelHost } from './panels/PanelHost'
import { useDocuments } from './state/documents'
import { applySettings, patchSettings, useSettings } from './state/settings'
import { useWorkspace } from './state/workspace'
import { useEditorContext } from './state/editor-context'
import { closePanel, togglePanel, usePanel } from './state/ui'
import { useSessionBoot, touchSession } from './state/session'

export function App(): JSX.Element {
  const settings = useSettings()
  const workspace = useWorkspace()
  const { active } = useDocuments()
  const { ctx, scopes } = useEditorContext()
  const panel = usePanel()
  const boot = useSessionBoot()
  const [error, setError] = useState<string | null>(null)

  /** Keep the session pointed at whatever is in front. */
  useEffect(() => {
    if (!active) return
    touchSession({ activeDoc: active.meta.path })
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
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'F1') {
        e.preventDefault()
        togglePanel('shortcuts')
      } else if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        togglePanel('palette')
      } else if (mod && e.key === ',') {
        e.preventDefault()
        togglePanel('settings')
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        togglePanel('export')
      } else if (mod && e.key.toLowerCase() === 'h') {
        // Ctrl+Shift+H was already taken by 高亮, and history reads more
        // naturally on the unshifted chord anyway.
        e.preventDefault()
        togglePanel('history')
      }
      // Escape is deliberately not handled here — PanelHost owns dismissal
      // for the panels, and the palette owns its own. Handling it in both
      // places meant two handlers racing on the same keystroke.
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    void applySettings()
  }, [])

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
      const narrow = window.innerWidth < NARROW
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
    root.dataset.theme = settings.theme === 'light' ? 'light' : 'dark'
    root.dataset.motion = settings.motion
    root.style.setProperty('--reading-size', `${settings.fontSize}px`)
    root.style.setProperty('--measure', `${settings.measure}ch`)
    root.style.setProperty('--editor-font-size', `${settings.codeFontSize ?? 14}px`)
    root.style.setProperty('--editor-line-height', String(settings.lineHeight ?? 1.7))
    root.style.setProperty('--editor-caret-shape', settings.cursorStyle ?? 'bar')
    root.style.setProperty('--editor-tab-size', String(settings.tabSize ?? 2))

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
    settings.theme,
    settings.motion,
    settings.fontSize,
    settings.measure,
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
      <TitleBar onOpenFolder={openFolder} />
      <div className="app-body">
        {settings.sidebarVisible && <Sidebar />}
        {error ? (
          <main className="doc doc--center">
            <p className="doc__notice doc__notice--error">{error}</p>
          </main>
        ) : !boot.booted ? (
          // Hold the first paint until the session is read — rendering the
          // welcome screen and then swapping it out would flash.
          <main className="doc doc--center" />
        ) : active ? (
          <EditorPane />
        ) : (
          <Welcome onOpenFolder={openFolder} />
        )}
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
