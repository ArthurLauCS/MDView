import type { Revision } from '@shared/types'

const listeners = new Set<(docId: string) => void>()

export function subscribeHistory(listener: (docId: string) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function recordRevision(docId: string, text: string, kind: Revision['kind']): Promise<void> {
  const revision = await window.mdview.history.record(docId, text, kind)
  if (revision) for (const listener of listeners) listener(docId)
}
