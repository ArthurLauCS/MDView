import { useEffect, useState } from 'react'
import { TitleBar } from './shell/TitleBar'
import { Sidebar } from './shell/Sidebar'
import { DocumentView } from './shell/DocumentView'
import { applySettings, useSettings } from './state/settings'
import { useWorkspace } from './state/workspace'

export function App(): JSX.Element {
  const settings = useSettings()
  const workspace = useWorkspace()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void applySettings()
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
        <DocumentView onOpenFolder={openFolder} error={error} />
      </div>
    </div>
  )
}
