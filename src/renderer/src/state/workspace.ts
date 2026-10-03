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
    void sync()
    return () => {
      listeners.delete(l)
    }
  }, [])

  const openDialog = useCallback(async () => {
    const opened = await window.mdview.workspace.openDialog()
    if (opened) {
      current = opened
      emit()
    }
  }, [])

  const openPath = useCallback(async (path: string) => {
    current = await window.mdview.workspace.openPath(path)
    emit()
  }, [])

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
