import { useEffect } from 'react'
import { SettingsPanel } from './SettingsPanel'
import { ExportPanel } from './ExportPanel'
import { OrganizePanel } from './OrganizePanel'
import { HelpPanel } from './HelpPanel'
import { closePanel, usePanel } from '../state/ui'
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

  if (active === 'settings' || active === 'shortcuts') {
    return <SettingsPanel key={active} onClose={closePanel} initialSection={active === 'shortcuts' ? 'shortcuts' : undefined} />
  }
  if (active === 'export') return <ExportPanel onClose={closePanel} />
  if (active === 'organize') return <OrganizePanel onClose={closePanel} />
  if (active === 'help') return <HelpPanel onClose={closePanel} />
  return null
}

export { openPanel, closePanel, togglePanel } from '../state/ui'
export type { PanelId } from '../state/ui'
