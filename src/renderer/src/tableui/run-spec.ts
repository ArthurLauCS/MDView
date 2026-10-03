import { cellAt, findTableAt, parseTable, replaceTable, type CellPos } from '../table/model'
import { GROUPS } from './specs'
import type { ActionContext } from '../actions/types'

/**
 * The single bridge between the action registry and the table engine.
 *
 * A shortcut, a context-menu entry and a toolbar button all name the same
 * action id; each of those surfaces ends up here, so there is exactly one
 * place where an id becomes a matrix transformation.
 */
export function runTableAction(id: string, ctx: ActionContext): boolean {
  const edit = resolve(id, ctx)
  if (!edit) return false
  ctx.replace(0, ctx.source.length, edit.text, edit.cursor)
  return true
}

/** True when the cursor sits in a table whose caret maps to a real cell. */
export function tableCellAt(source: string, cursor: number): CellPos | null {
  const context = findTableAt(source, cursor)
  if (!context) return null
  return cellAt(context, cursor)
}

function resolve(id: string, ctx: ActionContext): { text: string; cursor: number } | null {
  const context = findTableAt(ctx.source, ctx.cursor)
  if (!context) return null

  const cells = parseTable(context)
  const cell = cellAt(context, ctx.cursor)
  const spec = GROUPS.flatMap((g) => g.specs).find((s) => s.id === id)
  if (!spec) return null

  const input = { cells, aligns: context.aligns, cell, hasHeader: true }
  if (spec.disabledReason?.(input)) return null

  const nextCells = spec.cells ? spec.cells(input) : cells
  const nextAligns = spec.aligns ? spec.aligns(input) : context.aligns

  return replaceTable(ctx.source, context, nextCells, nextAligns, {
    pad: spec.pad,
    cursor: ctx.cursor
  })
}

/** Every table action id the toolbar knows how to perform. */
export function tableActionIds(): string[] {
  return GROUPS.flatMap((g) => g.specs.map((s) => s.id))
}
