import { t } from '../i18n'
import { useCallback, useMemo } from 'react'
import { GROUPS, type Spec, type SpecInput } from './specs'
import type { TableEdit } from './useTableEdit'
import type { Align, CellPos } from '../table/model'
import '../tableui/table.css'

export interface TableToolbarProps {
  edit: TableEdit
  /** Commit new source and caret back into the editor. */
  onApply: (text: string, cursor: number) => void
}

export function TableToolbar({ edit, onApply }: TableToolbarProps): JSX.Element | null {
  const { context, cells, cell, applyCells, flashRow, flashCol, flash } = edit

  const hasHeader = useMemo(() => {
    // `parseTable` keeps the header as row 0 and drops the delimiter row, so a
    // real header and a body row are distinguishable only by content: an
    // all-blank first row is what turning the header off leaves behind.
    return cells.length > 1 ? cells[0].some((c) => c !== '') : false
  }, [cells])

  const input: SpecInput | null = useMemo(
    () => (context ? { cells, aligns: context.aligns, cell, hasHeader } : null),
    [context, cells, cell, hasHeader]
  )

  /**
   * Mark the band a structural op would touch.
   *
   * Driven from hover and click rather than from the result, so the target is
   * visible before it moves.
   */
  const mark = useCallback(
    (spec: Spec, at: CellPos) => {
      if (!spec.structural) return
      // Row ops act on the row; everything else — columns, alignment, sorting,
      // merging — is scoped to the column the caret is in.
      if (spec.group === 'row') flashRow(at.row)
      else flashCol(at.col)
    },
    [flashRow, flashCol]
  )

  const run = useCallback(
    (spec: Spec) => {
      if (!input) return
      const at = input.cell ?? { row: 0, col: 0 }
      mark(spec, at)

      if (!spec.cells && !spec.pad) return
      const nextCells = spec.cells ? spec.cells(input) : cells
      const nextAligns: Align[] | undefined = spec.aligns ? spec.aligns(input) : undefined
      const applied = applyCells(nextCells, nextAligns, spec.pad)
      if (applied) onApply(applied.text, applied.cursor)
    },
    [input, cells, mark, applyCells, onApply]
  )

  if (!context || !input) return null

  return (
    <div className="ttable" role="toolbar" aria-label={t('表格工具')}>
      <span className="ttable__pos">
        {cell ? `${cell.row + 1}·${cell.col + 1}` : t('表格')}
      </span>
      {GROUPS.map((group) => (
        <div className="ttable__group" key={group.id} role="group" aria-label={group.label}>
          <span className="ttable__label">{group.label}</span>
          {group.specs.map((spec) => {
            const reason = spec.disabledReason?.(input) ?? null
            return (
              <button
                key={spec.id}
                className="ttable__btn"
                disabled={reason !== null}
                title={reason ?? spec.label}
                aria-label={spec.label}
                onMouseEnter={() => mark(spec, input.cell ?? { row: 0, col: 0 })}
                onClick={() => run(spec)}
              >
                {spec.label}
              </button>
            )
          })}
        </div>
      ))}
      <span className="ttable__flash" aria-live="polite">
        {flash ? (flash.kind === 'row' ? t('第 {0} 行', flash.index + 1) : t('第 {0} 列', flash.index + 1)) : ''}
      </span>
    </div>
  )
}
