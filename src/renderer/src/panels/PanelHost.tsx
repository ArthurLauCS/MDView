import { useCallback, useEffect } from 'react'
import { SettingsPanel } from './SettingsPanel'
import { ExportPanel } from './ExportPanel'
import { ShortcutsPanel } from './ShortcutsPanel'
import { HelpPanel } from './HelpPanel'
import { HistoryPanel } from '../history/HistoryPanel'
import { closePanel, usePanel } from '../state/ui'
import { resolveWelcome } from '../state/welcome'
import './panels.css'
import './shortcuts.css'
import './export.css'

/**
 * Mounts whichever overlay is currently open and owns the escape key for all
 * of them. Panels are opened by id through `state/ui`, so a keyboard handler,
 * an action or a menu item all drive the same switch.
 */
export function PanelHost(): JSX.Element | null {
  const active = usePanel()

  /**
   * Open the bundled welcome document, unpacking it on first use. Shared by
   * the 帮助 panel and the settings 帮助 section so there is one place that
   * knows how the document is stored.
   */
  const openWelcome = useCallback((): void => {
    void resolveWelcome().then(() => closePanel())
  }, [])

  useEffect(() => {
    if (!active || active === 'palette') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      closePanel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active])

  if (active === 'settings') {
    return <SettingsPanel onClose={closePanel} onOpenWelcome={openWelcome} />
  }
  if (active === 'export') return <ExportPanel onClose={closePanel} />
  if (active === 'shortcuts') return <ShortcutsPanel onClose={closePanel} />
  if (active === 'help') return <HelpPanel onClose={closePanel} />
  if (active === 'history') return <HistoryPanel onClose={closePanel} />
  return null
}

export { openPanel, closePanel, togglePanel } from '../state/ui'
export type { PanelId } from '../state/ui'
