import { t } from '../i18n'
import { settingsSnapshot } from '../state/settings'
/**
 * Toolbar buttons, keyed by the action ids in `actions/registry.ts`.
 *
 * The registry is the app's single list of operations and the toolbar is a
 * fourth view over it, alongside the keymap, the palette and the context menu.
 * Every button here carries the id of the action it stands for, so the two can
 * never describe different operations — the table actions are still stubs in
 * the registry, and this file is where each id becomes an engine call.
 *
 * A button is described, not wired: `cells` and `aligns` produce the next
 * matrix, and the toolbar hands that to the engine once.
 */

import {
  appendStatsRow,
  clearCell,
  deleteCol,
  deleteRow,
  fromDelimited,
  insertCol,
  insertRow,
  isMerged,
  mergeDown,
  mergeRight,
  moveCol,
  moveRow,
  rowAsTable,
  setColumnAlign,
  setHeaderRow,
  setTableStyle,
  sortByColumn,
  splitCell,
  tableRegionEnd,
  tableStyles,
  toCsv,
  toJson,
  toList,
  toggleCellNewline,
  transpose,
  type SortDir,
  type StatsKind,
  type TableStyle
} from '../table/ops'
import type { Align, CellPos, TableContext } from '../table/model'
import { escapePipes, serializeTable, parseTable } from '../table/model'

export type Cells = string[][]

export interface SpecInput {
  cells: Cells
  aligns: Align[]
  /** Matrix position of the caret; row 0 is the header. */
  cell: CellPos | null
  /** The first row is always the header row in the matrix. */
  hasHeader: boolean
}

/** Everything a spec needs beyond the matrix, including the clipboard text. */
export interface SpecRun {
  cell: CellPos | null
  /** Clipboard text, read by the caller before the spec runs. */
  text: string
}

export interface SpecResult {
  /** Replacement for the table block in the document. */
  text: string
  cursor?: number
}

export interface Spec {
  /** Registry action id — the same one a shortcut or menu item would invoke. */
  id: string
  label: string
  group: 'row' | 'col' | 'align' | 'data' | 'cell' | 'struct'
  /** True when the op restructures the table and should be previewed first. */
  structural: boolean
  disabledReason?: (input: SpecInput) => string | null
  cells?: (input: SpecInput) => Cells
  aligns?: (input: SpecInput) => Align[]
  /** Serialize with aligned pipes — the whole-table beautifier. */
  pad?: boolean
  /** Read from the clipboard before the op runs; the text arrives in `run`. */
  needsClipboard?: boolean
  /** Write `run.text` to the clipboard instead of replacing anything. */
  copies?: (ctx: TableContext, src: string, run: SpecRun) => string
  /** Range to select — the table as a whole, marker line included. */
  selects?: (ctx: TableContext, src: string) => [number, number]
  /**
   * Ops that replace the block with something that is no longer a table — a
   * fenced CSV block, a bullet list — or that act on the table as a whole.
   * They still live here, so every action id keeps mapping to exactly one
   * behaviour.
   */
  transform?: (ctx: TableContext, src: string, run: SpecRun) => SpecResult | null
}

export interface GroupSpec {
  id: Spec['group']
  label: string
  specs: Spec[]
}

/** Row and column indices only exist when the caret is inside the table. */
function at(input: SpecInput): CellPos {
  return input.cell ?? { row: 0, col: 0 }
}

function alignFor(align: Align) {
  return (input: SpecInput): Align[] => setColumnAlign(input.aligns, at(input).col, align)
}

/** A fenced block replacing the table — the `to*` direction. */
function asFence(lang: string, body: string): SpecResult {
  return { text: '```' + lang + '\n' + body + '\n```' }
}

/**
 * Matrix from clipboard text. `fromDelimited` already prefers the HTML table
 * when there is one — which matters, because Excel puts the grid in the HTML
 * flavour and a coarser tab-separated copy in the text flavour.
 */
function cellsFromText(text: string): Cells {
  return fromDelimited(text).map((row) =>
    row.map((cell) => escapePipes(cell).replace(/\r\n|\r|\n/g, '<br>'))
  )
}

/** The fence directly under the table, when it is the one the caret is in. */
function fenceBody(src: string, ctx: TableContext, lang: string): string | null {
  const m = /^\n(?:```|~~~)(\w*)\n([\s\S]*?)\n(?:```|~~~)/.exec(src.slice(ctx.end))
  if (!m || m[1] !== lang) return null
  return m[2]
}

/**
 * Toggle one rendering style. The marker is written through the engine, so the
 * exclusivity of the visual styles is enforced in one place.
 */
function styleSpec(id: string, label: string, style: TableStyle): Spec {
  return {
    id,
    get label() { return t(label) },
    group: 'struct',
    structural: false,
    transform: (ctx, src) => {
      const on = !tableStyles(src, ctx).includes(style)
      const text = setTableStyle(src, ctx, style, on)
      // Measured after the write: adding or dropping a marker moves the end.
      return { text, cursor: tableRegionEnd(text, ctx.end) }
    }
  }
}

export const GROUPS: GroupSpec[] = [
  {
    id: 'row',
    get label() { return t('行') },
    specs: [
      {
        id: 'table.row.insertAbove',
        get label() { return t('上行') },
        group: 'row',
        structural: true,
        cells: (i) => insertRow(i.cells, at(i).row, true)
      },
      {
        id: 'table.row.insertBelow',
        get label() { return t('下行') },
        group: 'row',
        structural: true,
        cells: (i) => insertRow(i.cells, at(i).row)
      },
      {
        id: 'table.row.delete',
        get label() { return t('删行') },
        group: 'row',
        structural: true,
        disabledReason: (i) => (i.cells.length <= 1 ? t('至少保留一行') : null),
        cells: (i) => deleteRow(i.cells, at(i).row)
      },
      {
        id: 'table.row.moveUp',
        get label() { return t('上移') },
        group: 'row',
        structural: true,
        disabledReason: (i) => (at(i).row <= 0 ? t('表头不能上移') : null),
        cells: (i) => moveRow(i.cells, at(i).row, at(i).row - 1)
      },
      {
        id: 'table.row.moveDown',
        get label() { return t('下移') },
        group: 'row',
        structural: true,
        disabledReason: (i) => (at(i).row >= i.cells.length - 1 ? t('已在最后一行') : null),
        cells: (i) => moveRow(i.cells, at(i).row, at(i).row + 1)
      },
      {
        id: 'table.row.copy',
        get label() { return t('复制行') },
        group: 'row',
        structural: false,
        copies: (ctx, _src, run) => rowAsTable(parseTable(ctx), run.cell?.row ?? 0, ctx.aligns)
      },
      {
        id: 'table.row.cut',
        get label() { return t('剪切行') },
        group: 'row',
        structural: true,
        disabledReason: (i) => (i.cells.length <= 1 ? t('至少保留一行') : null),
        copies: (ctx, _src, run) => rowAsTable(parseTable(ctx), run.cell?.row ?? 0, ctx.aligns),
        cells: (i) => deleteRow(i.cells, at(i).row)
      }
    ]
  },
  {
    id: 'col',
    get label() { return t('列') },
    specs: [
      {
        id: 'table.col.insertLeft',
        get label() { return t('左列') },
        group: 'col',
        structural: true,
        cells: (i) => insertCol(i.cells, at(i).col, true)
      },
      {
        id: 'table.col.insertRight',
        get label() { return t('右列') },
        group: 'col',
        structural: true,
        cells: (i) => insertCol(i.cells, at(i).col)
      },
      {
        id: 'table.col.delete',
        get label() { return t('删列') },
        group: 'col',
        structural: true,
        disabledReason: (i) => (i.aligns.length <= 1 ? t('至少保留一列') : null),
        cells: (i) => deleteCol(i.cells, at(i).col)
      },
      {
        id: 'table.col.moveLeft',
        get label() { return t('左移') },
        group: 'col',
        structural: true,
        disabledReason: (i) => (at(i).col <= 0 ? t('已是第一列') : null),
        cells: (i) => moveCol(i.cells, at(i).col, at(i).col - 1)
      },
      {
        id: 'table.col.moveRight',
        get label() { return t('右移') },
        group: 'col',
        structural: true,
        disabledReason: (i) => (at(i).col >= i.aligns.length - 1 ? t('已是最后一列') : null),
        cells: (i) => moveCol(i.cells, at(i).col, at(i).col + 1)
      }
    ]
  },
  {
    id: 'align',
    get label() { return t('对齐') },
    specs: [
      {
        id: 'table.col.alignLeft',
        get label() { return t('左') },
        group: 'align',
        structural: false,
        aligns: alignFor('left')
      },
      {
        id: 'table.col.alignCenter',
        get label() { return t('中') },
        group: 'align',
        structural: false,
        aligns: alignFor('center')
      },
      {
        id: 'table.col.alignRight',
        get label() { return t('右') },
        group: 'align',
        structural: false,
        aligns: alignFor('right')
      }
    ]
  },
  {
    id: 'data',
    get label() { return t('数据') },
    specs: [
      {
        id: 'table.sort.asc',
        get label() { return t('升序') },
        group: 'data',
        structural: true,
        cells: (i) => sortByColumn(i.cells, at(i).col, 'asc' satisfies SortDir, { hasHeader: i.hasHeader })
      },
      {
        id: 'table.sort.desc',
        get label() { return t('降序') },
        group: 'data',
        structural: true,
        cells: (i) => sortByColumn(i.cells, at(i).col, 'desc' satisfies SortDir, { hasHeader: i.hasHeader })
      },
      {
        id: 'table.stats.sum',
        get label() { return t('求和') },
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'sum' satisfies StatsKind, settingsSnapshot().language)
      },
      {
        id: 'table.stats.avg',
        get label() { return t('均值') },
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'avg' satisfies StatsKind, settingsSnapshot().language)
      },
      {
        id: 'table.stats.count',
        get label() { return t('计数') },
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'count' satisfies StatsKind, settingsSnapshot().language)
      },
      {
        id: 'table.stats.min',
        get label() { return t('最小') },
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'min' satisfies StatsKind, settingsSnapshot().language)
      },
      {
        id: 'table.stats.max',
        get label() { return t('最大') },
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'max' satisfies StatsKind, settingsSnapshot().language)
      },
      {
        id: 'table.select.all',
        get label() { return t('选中表格') },
        group: 'data',
        structural: false,
        // The marker line is part of the table region, so a copy of the
        // selection carries the style with it.
        selects: (ctx, src) => [ctx.start, tableRegionEnd(src, ctx.end)]
      },
      {
        id: 'table.paste.fromClipboard',
        get label() { return t('粘贴建表') },
        group: 'data',
        structural: false,
        needsClipboard: true,
        transform: (ctx, _src, run) => {
          const cells = cellsFromText(run.text)
          if (cells.length === 0) return null
          const text = serializeTable(cells, ctx.aligns)
          return { text, cursor: ctx.start + text.length }
        }
      },
      {
        id: 'table.paste.fromExcel',
        get label() { return t('从 Excel') },
        group: 'data',
        structural: false,
        needsClipboard: true,
        transform: (ctx, _src, run) => {
          // Excel always puts a real `<table>` on the clipboard; without one
          // this is a plain-text paste and the other action is the right one.
          if (!/<table/i.test(run.text)) return null
          const cells = cellsFromText(run.text)
          if (cells.length === 0) return null
          const text = serializeTable(cells, ctx.aligns)
          return { text, cursor: ctx.start + text.length }
        }
      }
    ]
  },
  {
    id: 'cell',
    get label() { return t('单元格') },
    specs: [
      {
        id: 'table.cell.merge',
        get label() { return t('右合并') },
        group: 'cell',
        structural: true,
        disabledReason: (i) => (i.aligns.length < 2 ? t('至少需要两列') : null),
        cells: (i) => mergeRight(i.cells, at(i))
      },
      {
        id: 'table.cell.mergeDown',
        get label() { return t('下合并') },
        group: 'cell',
        structural: true,
        disabledReason: (i) => (at(i).row >= i.cells.length - 1 ? t('下方没有可合并的行') : null),
        cells: (i) => mergeDown(i.cells, at(i))
      },
      {
        id: 'table.cell.split',
        get label() { return t('拆分') },
        group: 'cell',
        structural: true,
        disabledReason: (i) => {
          const { row, col } = at(i)
          return isMerged(i.cells[row]?.[col] ?? '') ? null : t('该单元格没有合并')
        },
        cells: (i) => splitCell(i.cells, at(i))
      },
      {
        id: 'table.cell.clear',
        get label() { return t('清空') },
        group: 'cell',
        structural: false,
        cells: (i) => clearCell(i.cells, at(i))
      },
      {
        id: 'table.cell.newline',
        get label() { return t('换行') },
        group: 'cell',
        structural: false,
        cells: (i) => toggleCellNewline(i.cells, at(i))
      }
    ]
  },
  {
    id: 'struct',
    get label() { return t('结构') },
    specs: [
      {
        id: 'table.style.pad',
        get label() { return t('美化') },
        group: 'struct',
        structural: false,
        pad: true
      },
      {
        id: 'table.struct.transpose',
        get label() { return t('转置') },
        group: 'struct',
        structural: true,
        cells: (i) => transpose(i.cells)
      },
      {
        id: 'table.struct.headerOn',
        get label() { return t('设表头') },
        group: 'struct',
        structural: true,
        disabledReason: (i) => (i.hasHeader ? t('已有表头') : null),
        cells: (i) => setHeaderRow(i.cells, true)
      },
      {
        id: 'table.struct.headerOff',
        get label() { return t('取消表头') },
        group: 'struct',
        structural: true,
        disabledReason: (i) => (i.hasHeader ? null : t('没有表头')),
        cells: (i) => setHeaderRow(i.cells, false)
      },
      {
        id: 'table.struct.toCsv',
        get label() { return t('转 CSV') },
        group: 'struct',
        structural: false,
        transform: (ctx) => asFence('csv', toCsv(parseTable(ctx)))
      },
      {
        id: 'table.struct.fromCsv',
        get label() { return t('CSV 转表') },
        group: 'struct',
        structural: false,
        transform: (ctx, src) => {
          const body = fenceBody(src, ctx, 'csv')
          if (body === null) return null
          const cells = fromDelimited(body, ',')
          if (cells.length === 0) return null
          return { text: serializeTable(cells, ctx.aligns), cursor: ctx.start }
        }
      },
      {
        id: 'table.struct.toJson',
        get label() { return t('转 JSON') },
        group: 'struct',
        structural: false,
        transform: (ctx) => asFence('json', JSON.stringify(toJson(parseTable(ctx)), null, 2))
      },
      {
        id: 'table.struct.toList',
        get label() { return t('转列表') },
        group: 'struct',
        structural: false,
        transform: (ctx) => ({ text: toList(parseTable(ctx)) })
      },
      {
        id: 'table.struct.delete',
        get label() { return t('删除表格') },
        group: 'struct',
        structural: true,
        // Undoable through the document history rather than a modal, so this
        // states its scope in the label instead of asking for confirmation.
        transform: (ctx) => ({ text: '', cursor: ctx.start })
      },
      ...(['zebra', 'compact', 'borderless', 'card', 'center'] as TableStyle[]).map((s) =>
        styleSpec(
          `table.style.${s}`,
          { zebra: t('斑马纹'), compact: t('紧凑'), borderless: t('无边框'), card: t('卡片'), center: t('居中') }[s],
          s
        )
      )
    ]
  }
]
