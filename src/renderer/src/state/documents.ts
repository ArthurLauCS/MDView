import { useCallback, useEffect, useState } from 'react'
import type { DocumentContent } from '@shared/types'

type Listener = (d: DocumentContent | null) => void

let current: DocumentContent | null = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of listeners) l(current)
}

export async function openDocument(path: string): Promise<void> {
  current = await window.mdview.doc.read(path)
  emit()
}

export function closeDocument(): void {
  current = null
  emit()
}

export function currentDocument(): DocumentContent | null {
  return current
}

export function useDocuments(): {
  active: DocumentContent | null
  open: (path: string) => Promise<void>
  close: () => void
} {
  const [active, setActive] = useState<DocumentContent | null>(current)

  useEffect(() => {
    const l: Listener = (d) => setActive(d)
    listeners.add(l)
    setActive(current)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const open = useCallback((path: string) => openDocument(path), [])
  const close = useCallback(() => closeDocument(), [])

  return { active, open, close }
}
