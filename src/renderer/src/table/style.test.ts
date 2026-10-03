import { describe, expect, it } from 'vitest'
import { findTableAt, parseTable, replaceTable, type TableContext } from './model'
import {
  clearCell,
  cutRow,
  rowAsTable,
  setTableStyle,
  tableRegionEnd,
  tableStyles,
  toggleCellNewline,
  type TableStyle
} from './ops'

const DOC = ['# 标题', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '结尾'].join('\n')

const ctxOf = (src: string, needle = 'a | b'): TableContext => {
  const ctx = findTableAt(src, src.indexOf(needle))
  if (!ctx) throw new Error('no table found')
  return ctx
}

/** The document with `styles` applied, in order. */
const styled = (src: string, styles: TableStyle[]): string => {
  let out = src
  for (const s of styles) out = setTableStyle(out, ctxOf(out), s, true)
  return out
}

describe('clearCell', () => {
  const base = [
    ['h1', 'h2'],
    ['a', 'b']
  ]

  it('empties one cell and keeps the structure', () => {
    expect(clearCell(base, { row: 1, col: 0 })).toEqual([
      ['h1', 'h2'],
      ['', 'b']
    ])
  })

  it('empties the header without dropping the row', () => {
    expect(clearCell(base, { row: 0, col: 1 })[0]).toEqual(['h1', ''])
  })

  it('clears an already-empty cell as a no-op', () => {
    expect(clearCell([['']], { row: 0, col: 0 })).toEqual([['']])
  })

  it('ignores an out-of-bounds row or column', () => {
    expect(clearCell(base, { row: 9, col: 0 })).toEqual(base)
    expect(clearCell(base, { row: 0, col: 9 })).toEqual(base)
  })

  it('leaves a merged cell wrapper in place', () => {
    const merged = [['<td colspan="2">a</td>', ''], ['1', '2']]
    expect(clearCell(merged, { row: 0, col: 0 })[0]).toEqual(['', ''])
  })

  it('leaves the source matrix untouched', () => {
    const snapshot = JSON.stringify(base)
    clearCell(base, { row: 1, col: 0 })
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('toggleCellNewline', () => {
  const base = [
    ['h1'],
    ['a']
  ]

  it('appends a <br> to the cell', () => {
    expect(toggleCellNewline(base, { row: 1, col: 0 })).toEqual([['h1'], ['a<br>']])
  })

  it('removes it on the second press instead of stacking', () => {
    const once = toggleCellNewline(base, { row: 1, col: 0 })
    expect(toggleCellNewline(once, { row: 1, col: 0 })).toEqual(base)
  })

  it('collapses a hand-typed run of breaks', () => {
    expect(toggleCellNewline([['x<br><br>']], { row: 0, col: 0 })).toEqual([['x']])
  })

  it('treats a self-closing <br/> as a break too', () => {
    expect(toggleCellNewline([['x<br/>']], { row: 0, col: 0 })).toEqual([['x']])
  })

  it('adds a break to an empty cell', () => {
    expect(toggleCellNewline([['']], { row: 0, col: 0 })).toEqual([['<br>']])
  })

  it('ignores an out-of-bounds position', () => {
    expect(toggleCellNewline(base, { row: 5, col: 0 })).toEqual(base)
  })
})

describe('rowAsTable', () => {
  const cells = [
    ['名称', '数量'],
    ['苹果', '3'],
    ['梨', '5']
  ]

  it('writes the row under a real header', () => {
    expect(rowAsTable(cells, 2, ['none', 'none'])).toBe(
      '| 名称 | 数量 |\n| --- | --- |\n| 梨 | 5 |'
    )
  })

  it('carries the column alignments', () => {
    // The delimiter floors at three characters, so `left` is `:--` and `right`
    // is `--:` — the markers cost one of the three.
    expect(rowAsTable(cells, 2, ['left', 'right']).split('\n')[1]).toBe('| :-- | --: |')
  })

  it('re-parses with the alignments intact', () => {
    const src = rowAsTable(cells, 2, ['left', 'right'])
    expect(findTableAt(src, 0)!.aligns).toEqual(['left', 'right'])
  })

  it('re-parses to exactly the header plus that row', () => {
    const src = rowAsTable(cells, 1, ['none', 'none'])
    const ctx = findTableAt(src, 0)!
    expect(parseTable(ctx)).toEqual([
      ['名称', '数量'],
      ['苹果', '3']
    ])
  })

  it('survives a cell containing an escaped pipe', () => {
    const piped = [
      ['h'],
      ['a \\| b']
    ]
    const src = rowAsTable(piped, 1, ['none'])
    const ctx = findTableAt(src, 0)!
    expect(parseTable(ctx)[1]).toEqual(['a \\| b'])
  })

  it('returns nothing for an out-of-bounds row', () => {
    expect(rowAsTable(cells, 9, ['none', 'none'])).toBe('')
  })

  it('copies the only row of a one-row table', () => {
    expect(rowAsTable([['solo']], 0, ['none'])).toBe('| solo |\n| --- |')
  })

  it('copies the header as a header-only table', () => {
    expect(rowAsTable(cells, 0, ['none', 'none'])).toBe('| 名称 | 数量 |\n| --- | --- |')
  })
})

describe('cutRow', () => {
  const cells = [
    ['h1', 'h2'],
    ['a', 'b'],
    ['c', 'd']
  ]

  it('returns the markdown and the table without the row', () => {
    const res = cutRow(cells, 1, ['none', 'none'])
    expect(res.markdown).toContain('| a | b |')
    expect(res.cells).toEqual([
      ['h1', 'h2'],
      ['c', 'd']
    ])
  })

  it('leaves a valid one-row table when cutting the last body row', () => {
    const res = cutRow([['h'], ['only']], 1, ['none'])
    expect(res.cells).toEqual([['h']])
  })

  it('never drops the table to zero rows', () => {
    const res = cutRow([['h1', 'h2']], 0, ['none', 'none'])
    expect(res.cells.length).toBe(1)
  })

  it('ignores an out-of-bounds row', () => {
    const res = cutRow(cells, 9, ['none', 'none'])
    expect(res.markdown).toBe('')
    expect(res.cells).toEqual(cells)
  })
})

describe('tableStyles', () => {
  it('reports nothing for a plain table', () => {
    expect(tableStyles(DOC, ctxOf(DOC))).toEqual([])
  })

  it('reads a marker written after the table', () => {
    expect(tableStyles(styled(DOC, ['zebra']), ctxOf(styled(DOC, ['zebra'])))).toEqual(['zebra'])
  })

  it('composes a visual style with the flags', () => {
    const src = styled(DOC, ['zebra', 'compact', 'center'])
    expect(tableStyles(src, ctxOf(src))).toEqual(['zebra', 'compact', 'center'])
  })

  it('keeps only the first of two hand-written visual styles', () => {
    const src = DOC.replace('| 1 | 2 |', '| 1 | 2 |\n<!-- mdview:table style=zebra,card -->')
    expect(tableStyles(src, ctxOf(src))).toEqual(['zebra'])
  })

  it('ignores an unknown style name', () => {
    const src = DOC.replace('| 1 | 2 |', '| 1 | 2 |\n<!-- mdview:table style=sparkle -->')
    expect(tableStyles(src, ctxOf(src))).toEqual([])
  })
})

describe('setTableStyle', () => {
  it('adds a marker on the line after the table', () => {
    expect(styled(DOC, ['zebra'])).toBe(
      '# 标题\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n<!-- mdview:table style=zebra -->\n\n结尾'
    )
  })

  it('replaces the visual style rather than accumulating it', () => {
    const src = styled(DOC, ['zebra', 'card'])
    expect(tableStyles(src, ctxOf(src))).toEqual(['card'])
    expect(src).not.toContain('zebra')
  })

  it('composes flags with a visual style', () => {
    const src = styled(DOC, ['card', 'borderless', 'compact', 'center'])
    expect(tableStyles(src, ctxOf(src))).toEqual(['card', 'borderless', 'compact', 'center'])
  })

  it('cannot produce zebra and card together', () => {
    const forwards = styled(DOC, ['zebra', 'card'])
    const backwards = styled(DOC, ['card', 'zebra'])
    expect(tableStyles(forwards, ctxOf(forwards))).toEqual(['card'])
    expect(tableStyles(backwards, ctxOf(backwards))).toEqual(['zebra'])
    expect(forwards).not.toContain('zebra,')
    expect(backwards).not.toContain('card,')
  })

  it('turns a style off and drops an empty marker', () => {
    const on = styled(DOC, ['zebra'])
    const off = setTableStyle(on, ctxOf(on), 'zebra', false)
    expect(off).toBe(DOC)
  })

  it('keeps the other styles when one is turned off', () => {
    const on = styled(DOC, ['zebra', 'compact'])
    const off = setTableStyle(on, ctxOf(on), 'zebra', false)
    expect(tableStyles(off, ctxOf(off))).toEqual(['compact'])
  })

  it('is idempotent when a style is already on', () => {
    const once = styled(DOC, ['compact'])
    const twice = setTableStyle(once, ctxOf(once), 'compact', true)
    expect(twice).toBe(once)
  })

  it('writes the marker even when the table ends the document', () => {
    const tail = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    const src = setTableStyle(tail, ctxOf(tail), 'zebra', true)
    expect(src).toBe(tail + '\n<!-- mdview:table style=zebra -->')
  })

  it('does not disturb the text before the table', () => {
    const src = styled(DOC, ['zebra'])
    expect(src.startsWith('# 标题\n\n| a | b |')).toBe(true)
    expect(src.endsWith('\n\n结尾')).toBe(true)
  })
})

describe('style marker round trip', () => {
  it('survives findTableAt with the table unchanged', () => {
    const src = styled(DOC, ['zebra', 'compact'])
    const ctx = ctxOf(src)
    expect(parseTable(ctx)).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
    expect(ctx.raw).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(tableStyles(src, ctx)).toEqual(['zebra', 'compact'])
  })

  it('never lets the marker become a body row', () => {
    const one = '| a |\n| --- |\n| 1 |'
    const src = setTableStyle(one, ctxOf(one, '| a |'), 'zebra', true)
    const ctx = ctxOf(src, '| a |')
    expect(ctx.bodyRows).toBe(1)
    expect(parseTable(ctx)).toEqual([['a'], ['1']])
  })

  it('serializes back byte-identical after an unrelated edit', () => {
    const src = styled(DOC, ['zebra'])
    const ctx = ctxOf(src)
    const { text } = replaceTable(src, ctx, parseTable(ctx), ctx.aligns)
    expect(text).toBe(src)
  })

  it('leaves a document with no marker without one', () => {
    const ctx = ctxOf(DOC)
    const { text } = replaceTable(DOC, ctx, parseTable(ctx), ctx.aligns)
    expect(text).toBe(DOC)
    expect(text).not.toContain('mdview:table')
  })

  it('keeps the marker when a row is edited', () => {
    const src = styled(DOC, ['card'])
    const ctx = ctxOf(src)
    const cells = parseTable(ctx)
    cells[1][0] = '9'
    const { text } = replaceTable(src, ctx, cells, ctx.aligns)
    expect(text).toContain('| 9 | 2 |')
    expect(tableStyles(text, ctxOf(text))).toEqual(['card'])
  })
})

describe('tableRegionEnd', () => {
  it('includes a trailing marker line', () => {
    const src = styled(DOC, ['zebra'])
    const ctx = ctxOf(src)
    expect(src.slice(ctx.start, tableRegionEnd(src, ctx.end))).toBe(
      '| a | b |\n| --- | --- |\n| 1 | 2 |\n<!-- mdview:table style=zebra -->'
    )
  })

  it('stops at the table when there is no marker', () => {
    const ctx = ctxOf(DOC)
    expect(tableRegionEnd(DOC, ctx.end)).toBe(ctx.end)
  })

  it('stops at the table when the next line is ordinary text', () => {
    const src = DOC.replace('\n\n结尾', '\n\n| not a marker |')
    const ctx = ctxOf(src)
    expect(tableRegionEnd(src, ctx.end)).toBe(ctx.end)
  })
})
