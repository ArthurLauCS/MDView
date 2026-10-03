import { cellAt, findTableAt, parseTable, replaceTable, type CellPos } from '../table/model'
import { GROUPS } from './specs'
import type { ActionContext } from '../actions/types'

/** What running one spec produces: an edit, a clipboard write, or both. */
export interface TableEffect {
  edit: { text: string; cursor: number } | null
  clipboard: string | null
  select: [number, number] | null
}

/**
 * The single bridge between the action registry and the table engine.
 *
 * A shortcut, a context-menu entry and a toolbar button all name the same
 * action id; each of those surfaces ends up here, so there is exactly one
 * place where an id becomes a matrix transformation.
 *
 * `clipboard` carries text read before the call — the caller reads it, because
 * reading is asynchronous and this function is not.
 */
export function runTableAction(id: string, ctx: ActionContext, clipboard = ''): boolean {
  const effect = resolveTable(id, ctx, clipboard)
  if (!effect) return false
  if (effect.clipboard !== null) void window.mdview.clipboard.writeText(effect.clipboard)
  if (effect.select) ctx.select(effect.select[0], effect.select[1])
  else if (effect.edit) ctx.replace(0, ctx.source.length, effect.edit.text, effect.edit.cursor)
  return true
}

/**
 * The spec for `id` run against the table under the caret, or null when the
 * caret is not in a table, the id is unknown, or the op is disabled for this
 * cell — the three cases a menu greys out identically.
 */
export function resolveTable(
  id: string,
  ctx: ActionContext,
  clipboard: string
): TableEffect | null {
  const context = findTableAt(ctx.source, ctx.cursor)
  if (!context) return null

  const spec = GROUPS.flatMap((g) => g.specs).find((s) => s.id === id)
  if (!spec) return null

  const cells = parseTable(context)
  const cell = cellAt(context, ctx.cursor)
  const input = { cells, aligns: context.aligns, cell, hasHeader: true }
  if (spec.disabledReason?.(input)) return null

  const run = { cell, text: clipboard }
  const transformed = spec.transform?.(context, ctx.source, run) ?? null
  if (spec.transform && !transformed) return null

  const fallback = replaceTable(
    ctx.source,
    context,
    spec.cells ? spec.cells(input) : cells,
    spec.aligns ? spec.aligns(input) : context.aligns,
    { pad: spec.pad, cursor: ctx.cursor }
  )
  // A `transform` owns the block outright; otherwise the matrix result stands.
  // Neither means the spec only reads — a row copy, say — and changes nothing.
  const edits = spec.transform || spec.cells || spec.aligns || spec.pad
  const edit = !edits
    ? null
    : spec.transform
      ? { text: transformed!.text, cursor: transformed!.cursor ?? context.start }
      : fallback

  return {
    edit,
    clipboard: spec.copies ? spec.copies(context, ctx.source, run) : null,
    select: spec.selects ? spec.selects(context, ctx.source) : null
  }
}

/** True when running this spec needs the clipboard read first. */
export function needsClipboard(id: string): boolean {
  return GROUPS.flatMap((g) => g.specs).find((s) => s.id === id)?.needsClipboard === true
}

/** True when the cursor sits in a table whose caret maps to a real cell. */
export function tableCellAt(source: string, cursor: number): CellPos | null {
  const context = findTableAt(source, cursor)
  if (!context) return null
  return cellAt(context, cursor)
}

/** Every table action id the toolbar knows how to perform. */
export function tableActionIds(): string[] {
  return GROUPS.flatMap((g) => g.specs.map((s) => s.id))
}
