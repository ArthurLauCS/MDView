import { useEffect, useState } from 'react'

export type PanelId = 'settings' | 'export' | 'shortcuts' | 'palette' | null

type Listener = (id: PanelId) => void

let current: PanelId = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of listeners) l(current)
}

/**
 * Only one overlay is ever on screen. A stack would let a user end up with a
 * palette behind a settings sheet and no obvious way back, and these panels
 * are all one level deep by nature.
 */
export function openPanel(id: Exclude<PanelId, null>): void {
  current = id
  emit()
}

export function closePanel(): void {
  current = null
  emit()
}

export function togglePanel(id: Exclude<PanelId, null>): void {
  current = current === id ? null : id
  emit()
}

export function activePanel(): PanelId {
  return current
}

export function usePanel(): PanelId {
  const [value, setValue] = useState<PanelId>(current)
  useEffect(() => {
    const l: Listener = (id) => setValue(id)
    listeners.add(l)
    setValue(current)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return value
}
