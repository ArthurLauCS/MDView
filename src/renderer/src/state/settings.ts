import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

type Listener = (s: AppSettings) => void

let current: AppSettings = { ...DEFAULT_SETTINGS }
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of listeners) l(current)
}

export async function applySettings(): Promise<void> {
  current = await window.mdview.settings.get()
  emit()
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<void> {
  // Optimistic: the UI should never lag a toggle waiting on disk IO.
  current = { ...current, ...patch }
  emit()
  await window.mdview.settings.patch(patch)
}

export function useSettings(): AppSettings {
  const [value, setValue] = useState(current)

  useEffect(() => {
    const l: Listener = (s) => setValue(s)
    listeners.add(l)
    setValue(current)
    return () => {
      listeners.delete(l)
    }
  }, [])

  return value
}

/** Imperative read for event handlers that must not close over stale state. */
export function settingsSnapshot(): AppSettings {
  return current
}

export function usePatchSettings(): (patch: Partial<AppSettings>) => void {
  return useCallback((patch: Partial<AppSettings>) => {
    void patchSettings(patch)
  }, [])
}
