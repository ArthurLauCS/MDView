import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceInfo } from '@shared/types'

type Listener = (w: WorkspaceInfo | null) => void

let current: WorkspaceInfo | null = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of listeners) l(current)
}

async function sync(): Promise<void> {
  current = await window.mdview.workspace.tree()
  emit()
}

/** Open a known path. The dialog variant lives in the hook, not here. */
export async function openWorkspacePath(path: string): Promise<void> {
  current = await window.mdview.workspace.openPath(path)
  emit()
}

export async function openWorkspaceDialog(): Promise<void> {
  const opened = await window.mdview.workspace.openDialog()
  if (opened) { current = opened; emit() }
}

export function useWorkspace(): {
  info: WorkspaceInfo | null
  openDialog: () => Promise<void>
  openPath: (path: string) => Promise<void>
  refresh: () => Promise<void>
} {
  const [info, setInfo] = useState<WorkspaceInfo | null>(current)

  useEffect(() => {
    const l: Listener = (w) => setInfo(w)
    listeners.add(l)
    setInfo(current)
    // Only ask the main process when nothing has been opened yet. An
    // unconditional sync would race a concurrent openPath and clobber it
    // with the stale null it read a moment earlier.
    if (current === null) void sync()
    return () => {
      listeners.delete(l)
    }
  }, [])

  const openDialog = useCallback(openWorkspaceDialog, [])

  const openPath = useCallback((path: string) => openWorkspacePath(path), [])

  const refresh = useCallback(async () => {
    if (!current) return
    current = await window.mdview.workspace.openPath(current.rootPath)
    emit()
  }, [])

  return { info, openDialog, openPath, refresh }
}

export function workspaceRoot(): string | null {
  return current?.rootPath ?? null
}
