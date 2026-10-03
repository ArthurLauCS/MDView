import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { openDocument } from './state/documents'
import { patchSettings } from './state/settings'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/markdown.css'
import './App.css'

const el = document.getElementById('root')
if (!el) throw new Error('#root missing from index.html')

/**
 * Drive the UI from outside the window. The screenshot harness and future
 * end-to-end tests need to reach the same state layer the UI uses — poking
 * `window.mdview` directly would bypass the stores and leave the view stale.
 * Deliberately small: opening, settings, and nothing else.
 */
declare global {
  interface Window {
    __mdview?: {
      openWorkspace: (path: string) => Promise<void>
      openDocument: (path: string) => Promise<void>
      setSettings: (patch: Record<string, unknown>) => Promise<void>
    }
  }
}

window.__mdview = {
  openWorkspace: async (path) => {
    const { openWorkspacePath } = await import('./state/workspace')
    await openWorkspacePath(path)
  },
  openDocument,
  setSettings: async (patch) => {
    await patchSettings(patch as never)
  }
}

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
