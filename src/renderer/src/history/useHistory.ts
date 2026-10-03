import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiffSummary, Revision } from '@shared/types'
import { liveText } from './live-text'

export interface HistoryState {
  revisions: Revision[]
  loading: boolean
  refresh: () => Promise<void>
  snapshot: (text: string, kind: Revision['kind']) => Promise<void>
  contentsOf: (revId: string) => Promise<string | null>
  diffAgainst: (aRevId: string, bRevId: string) => Promise<DiffSummary | null>
  forget: (revId: string) => Promise<void>
  clear: () => Promise<void>
  jumpTo: (revId: string) => Promise<string | null>
}

/**
 * The document's revision history, as the UI sees it.
 *
 * The list is re-read after every mutation rather than patched locally — the
 * service owns deduplication and the 200-entry cap, so a locally spliced array
 * would drift from what is actually on disk.
 */
export function useHistory(docId: string | null): HistoryState {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)

  // Opening a document and awaiting its list is a round trip, so a slow reply
  // for the previous document must not land on the current one's panel.
  const currentDoc = useRef(docId)
  currentDoc.current = docId

  const refresh = useCallback(async (): Promise<void> => {
    if (!docId) {
      setRevisions([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const list = await window.mdview.history.list(docId)
      if (currentDoc.current === docId) setRevisions(list)
    } finally {
      if (currentDoc.current === docId) setLoading(false)
    }
  }, [docId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const snapshot = useCallback(
    async (text: string, kind: Revision['kind']): Promise<void> => {
      if (!docId) return
      await window.mdview.history.record(docId, text, kind)
      await refresh()
    },
    [docId, refresh]
  )

  const contentsOf = useCallback(
    (revId: string): Promise<string | null> =>
      docId ? window.mdview.history.read(docId, revId) : Promise.resolve(null),
    [docId]
  )

  const diffAgainst = useCallback(
    (aRevId: string, bRevId: string): Promise<DiffSummary | null> =>
      docId ? window.mdview.history.diff(docId, aRevId, bRevId) : Promise.resolve(null),
    [docId]
  )

  const forget = useCallback(
    async (revId: string): Promise<void> => {
      if (!docId) return
      await window.mdview.history.forget(docId, revId)
      await refresh()
    },
    [docId, refresh]
  )

  const clear = useCallback(async (): Promise<void> => {
    if (!docId) return
    await window.mdview.history.clear(docId)
    await refresh()
  }, [docId, refresh])

  const jumpTo = useCallback(
    async (revId: string): Promise<string | null> => {
      if (!docId) return null
      const text = await window.mdview.history.read(docId, revId)
      if (text === null) return null
      // Restoring is a change like any other, so the text being replaced is
      // snapshotted first — otherwise one mis-click on an old version would be
      // the one edit history could not undo. With no editor mounted there is
      // nothing to preserve, so the restore is skipped rather than failing.
      const current = liveText()
      if (current !== null) await snapshot(current, 'restore')
      return text
    },
    [docId, snapshot]
  )

  return { revisions, loading, refresh, snapshot, contentsOf, diffAgainst, forget, clear, jumpTo }
}
