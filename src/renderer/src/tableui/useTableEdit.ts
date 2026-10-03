/**
 * Binds the table engine to the editor's caret.
 *
 * The engine is pure and knows nothing about React; this hook is the only place
 * that holds the caret, the document text and the engine at once. Everything it
 * derives comes from the source it was handed, so a stale matrix cannot outlive
 * the text it was parsed from.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cellAt,
  findTableAt,
  parseTable,
  replaceTable,
  type Align,
  type CellPos,
  type TableContext
} from '../table/model'

/** Which row or column is currently marked, if any. */
export interface Flash {
  kind: 'row' | 'col'
  index: number
}

export interface TableEdit {
  context: TableContext | null
  cells: string[][]
  /** Matrix coordinates of the caret, null when it sits outside a table. */
  cell: CellPos | null
  applyCells: (
    next: string[][],
    aligns?: Align[],
    pad?: boolean
  ) => { text: string; cursor: number } | null
  flashRow: (index: number) => void
  flashCol: (index: number) => void
  /** The row or column a structural edit is about to touch. */
  flash: Flash | null
}

const FLASH_MS = 420

export function useTableEdit(source: string, cursor: number): TableEdit {
  const context = useMemo(() => findTableAt(source, cursor), [source, cursor])
  const cells = useMemo(() => (context ? parseTable(context) : []), [context])

  // The engine owns the offset-to-cell mapping; a second implementation here
  // would drift from it the moment either side's splitting rules changed.
  const cell = useMemo(() => {
    if (!context) return null
    return cellAt(context, cursor)
  }, [context, cursor, source])

  const [flash, setFlash] = useState<Flash | null>(null)
  const timer = useRef<number | null>(null)

  /**
   * Mark the row or column an edit is about to touch.
   *
   * A structural edit is disruptive enough that its target should be visible
   * before it moves, so this is driven from the button's hover and click rather
   * than from the change itself, which would only explain the damage.
   */
  const pulse = useCallback((kind: 'row' | 'col', index: number) => {
    if (timer.current) window.clearTimeout(timer.current)
    setFlash({ kind, index })
    timer.current = window.setTimeout(() => {
      setFlash(null)
      timer.current = null
    }, FLASH_MS)
  }, [])

  // A pending timer outliving the component would write state into a tree that
  // is no longer mounted.
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const flashRow = useCallback((index: number) => pulse('row', index), [pulse])
  const flashCol = useCallback((index: number) => pulse('col', index), [pulse])

  const applyCells = useCallback(
    (
      next: string[][],
      aligns?: Align[],
      pad?: boolean
    ): { text: string; cursor: number } | null => {
      if (!context) return null
      // The caret rides along through the engine's own mapping, so editing a
      // cell in the middle of a table does not throw the user back to the top.
      const edit = replaceTable(source, context, next, aligns ?? context.aligns, {
        cursor,
        ...(pad === undefined ? {} : { pad })
      })
      return { text: edit.text, cursor: edit.cursor }
    },
    [source, context, cursor]
  )

  return { context, cells, cell, applyCells, flashRow, flashCol, flash }
}
