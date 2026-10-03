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
  deleteCol,
  deleteRow,
  insertCol,
  insertRow,
  isMerged,
  mergeDown,
  mergeRight,
  moveCol,
  moveRow,
  setColumnAlign,
  setHeaderRow,
  sortByColumn,
  splitCell,
  transpose,
  type SortDir,
  type StatsKind
} from '../table/ops'
import type { Align, CellPos } from '../table/model'

export type Cells = string[][]

export interface SpecInput {
  cells: Cells
  aligns: Align[]
  /** Matrix position of the caret; row 0 is the header. */
  cell: CellPos | null
  /** The first row is always the header row in the matrix. */
  hasHeader: boolean
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

export const GROUPS: GroupSpec[] = [
  {
    id: 'row',
    label: '行',
    specs: [
      {
        id: 'table.row.insertAbove',
        label: '上行',
        group: 'row',
        structural: true,
        cells: (i) => insertRow(i.cells, at(i).row, true)
      },
      {
        id: 'table.row.insertBelow',
        label: '下行',
        group: 'row',
        structural: true,
        cells: (i) => insertRow(i.cells, at(i).row)
      },
      {
        id: 'table.row.delete',
        label: '删行',
        group: 'row',
        structural: true,
        disabledReason: (i) => (i.cells.length <= 1 ? '至少保留一行' : null),
        cells: (i) => deleteRow(i.cells, at(i).row)
      },
      {
        id: 'table.row.moveUp',
        label: '上移',
        group: 'row',
        structural: true,
        disabledReason: (i) => (at(i).row <= 0 ? '表头不能上移' : null),
        cells: (i) => moveRow(i.cells, at(i).row, at(i).row - 1)
      },
      {
        id: 'table.row.moveDown',
        label: '下移',
        group: 'row',
        structural: true,
        disabledReason: (i) => (at(i).row >= i.cells.length - 1 ? '已在最后一行' : null),
        cells: (i) => moveRow(i.cells, at(i).row, at(i).row + 1)
      }
    ]
  },
  {
    id: 'col',
    label: '列',
    specs: [
      {
        id: 'table.col.insertLeft',
        label: '左列',
        group: 'col',
        structural: true,
        cells: (i) => insertCol(i.cells, at(i).col, true)
      },
      {
        id: 'table.col.insertRight',
        label: '右列',
        group: 'col',
        structural: true,
        cells: (i) => insertCol(i.cells, at(i).col)
      },
      {
        id: 'table.col.delete',
        label: '删列',
        group: 'col',
        structural: true,
        disabledReason: (i) => (i.aligns.length <= 1 ? '至少保留一列' : null),
        cells: (i) => deleteCol(i.cells, at(i).col)
      },
      {
        id: 'table.col.moveLeft',
        label: '左移',
        group: 'col',
        structural: true,
        disabledReason: (i) => (at(i).col <= 0 ? '已是第一列' : null),
        cells: (i) => moveCol(i.cells, at(i).col, at(i).col - 1)
      },
      {
        id: 'table.col.moveRight',
        label: '右移',
        group: 'col',
        structural: true,
        disabledReason: (i) => (at(i).col >= i.aligns.length - 1 ? '已是最后一列' : null),
        cells: (i) => moveCol(i.cells, at(i).col, at(i).col + 1)
      }
    ]
  },
  {
    id: 'align',
    label: '对齐',
    specs: [
      {
        id: 'table.col.alignLeft',
        label: '左',
        group: 'align',
        structural: false,
        aligns: alignFor('left')
      },
      {
        id: 'table.col.alignCenter',
        label: '中',
        group: 'align',
        structural: false,
        aligns: alignFor('center')
      },
      {
        id: 'table.col.alignRight',
        label: '右',
        group: 'align',
        structural: false,
        aligns: alignFor('right')
      }
    ]
  },
  {
    id: 'data',
    label: '数据',
    specs: [
      {
        id: 'table.sort.asc',
        label: '升序',
        group: 'data',
        structural: true,
        cells: (i) => sortByColumn(i.cells, at(i).col, 'asc' satisfies SortDir, { hasHeader: i.hasHeader })
      },
      {
        id: 'table.sort.desc',
        label: '降序',
        group: 'data',
        structural: true,
        cells: (i) => sortByColumn(i.cells, at(i).col, 'desc' satisfies SortDir, { hasHeader: i.hasHeader })
      },
      {
        id: 'table.stats.sum',
        label: '求和',
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'sum' satisfies StatsKind)
      },
      {
        id: 'table.stats.avg',
        label: '均值',
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'avg' satisfies StatsKind)
      },
      {
        id: 'table.stats.count',
        label: '计数',
        group: 'data',
        structural: true,
        cells: (i) => appendStatsRow(i.cells, at(i).col, 'count' satisfies StatsKind)
      }
    ]
  },
  {
    id: 'cell',
    label: '单元格',
    specs: [
      {
        id: 'table.cell.merge',
        label: '右合并',
        group: 'cell',
        structural: true,
        disabledReason: (i) => (i.aligns.length < 2 ? '至少需要两列' : null),
        cells: (i) => mergeRight(i.cells, at(i))
      },
      {
        id: 'table.cell.mergeDown',
        label: '下合并',
        group: 'cell',
        structural: true,
        disabledReason: (i) => (at(i).row >= i.cells.length - 1 ? '下方没有可合并的行' : null),
        cells: (i) => mergeDown(i.cells, at(i))
      },
      {
        id: 'table.cell.split',
        label: '拆分',
        group: 'cell',
        structural: true,
        disabledReason: (i) => {
          const { row, col } = at(i)
          return isMerged(i.cells[row]?.[col] ?? '') ? null : '该单元格没有合并'
        },
        cells: (i) => splitCell(i.cells, at(i))
      }
    ]
  },
  {
    id: 'struct',
    label: '结构',
    specs: [
      {
        id: 'table.style.pad',
        label: '美化',
        group: 'struct',
        structural: false,
        pad: true
      },
      {
        id: 'table.struct.transpose',
        label: '转置',
        group: 'struct',
        structural: true,
        cells: (i) => transpose(i.cells)
      },
      {
        id: 'table.struct.headerOn',
        label: '设表头',
        group: 'struct',
        structural: true,
        disabledReason: (i) => (i.hasHeader ? '已有表头' : null),
        cells: (i) => setHeaderRow(i.cells, true)
      },
      {
        id: 'table.struct.headerOff',
        label: '取消表头',
        group: 'struct',
        structural: true,
        disabledReason: (i) => (i.hasHeader ? null : '没有表头'),
        cells: (i) => setHeaderRow(i.cells, false)
      }
    ]
  }
]
