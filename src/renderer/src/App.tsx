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

export function App(): JSX.Element {
  const settings = useSettings()
  const workspace = useWorkspace()
  const { active } = useDocuments()
  const { ctx, scopes } = useEditorContext()
  const panel = usePanel()
  const [error, setError] = useState<string | null>(null)

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
    document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.motion = settings.motion
    document.documentElement.style.setProperty('--reading-size', `${settings.fontSize}px`)
    document.documentElement.style.setProperty('--measure', `${settings.measure}ch`)
  }, [settings.theme, settings.motion, settings.fontSize, settings.measure])

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
