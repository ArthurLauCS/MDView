import { describe, expect, it } from 'vitest'
import {
  displayWidth,
  escapePipes,
  findTableAt,
  parseTable,
  replaceTable,
  serializeTable,
  suggestColumnWidths,
  type TableContext
} from './model'
import {
  appendStatsRow,
  deleteCol,
  deleteRow,
  fromDelimited,
  fromJson,
  fromList,
  insertCol,
  insertRow,
  isMerged,
  mergeDown,
  mergeRight,
  moveCol,
  moveRow,
  normalizeRows,
  padTable,
  setCell,
  setColumnAlign,
  setHeaderRow,
  sortByColumn,
  splitCell,
  toCsv,
  toJson,
  toList,
  transpose
} from './ops'

const ctxOf = (src: string, offset = 0): TableContext => {
  const ctx = findTableAt(src, offset)
  if (!ctx) throw new Error('no table found')
  return ctx
}

const round = (src: string, pad?: boolean): string => {
  const ctx = ctxOf(src)
  return serializeTable(parseTable(ctx), ctx.aligns, { pad })
}

describe('findTableAt', () => {
  const src = ['# Title', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'after'].join('\n')

  it('finds the table from a cursor inside it', () => {
    const ctx = ctxOf(src, src.indexOf('1 | 2'))
    expect(ctx.cols).toBe(2)
    expect(ctx.bodyRows).toBe(1)
    expect(ctx.aligns).toEqual(['none', 'none'])
    expect(ctx.raw).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('reports start and end offsets that slice back to raw', () => {
    const ctx = ctxOf(src, src.indexOf('1 | 2'))
    expect(src.slice(ctx.start, ctx.end)).toBe(ctx.raw)
  })

  it('handles a cursor in the header and on the delimiter row', () => {
    expect(findTableAt(src, src.indexOf('| a'))).not.toBeNull()
    expect(findTableAt(src, src.indexOf('| ---'))).not.toBeNull()
  })

  it('handles a cursor on trailing spaces of a cell', () => {
    const padded = '| a   | b |\n| --- | --- |\n| 1 | 2 |'
    expect(findTableAt(padded, padded.indexOf('a') + 4)).not.toBeNull()
  })

  it('handles a cursor in an empty cell', () => {
    const gappy = '| a | b |\n| --- | --- |\n|  | 2 |'
    const at = gappy.indexOf('\n|  | 2 |') + 4
    const ctx = findTableAt(gappy, at)
    expect(ctx).not.toBeNull()
    expect(parseTable(ctx!)[1]).toEqual(['', '2'])
  })

  it('returns null outside a table', () => {
    expect(findTableAt(src, 0)).toBeNull()
    expect(findTableAt(src, src.length)).toBeNull()
  })

  it('requires a delimiter row', () => {
    const noDelim = '| a | b |\n| 1 | 2 |'
    expect(findTableAt(noDelim, noDelim.indexOf('1'))).toBeNull()
  })

  it('read alignment markers from the delimiter row', () => {
    const aligned = '| a | b | c | d |\n| :-- | :-: | --: | --- |\n| 1 | 2 | 3 | 4 |'
    expect(ctxOf(aligned).aligns).toEqual(['left', 'center', 'right', 'none'])
  })

  it('stops at a blank line', () => {
    const tail = '| a | b |\n| --- | --- |\n| 1 | 2 |\n\ntext | more'
    expect(ctxOf(tail).bodyRows).toBe(1)
  })

  it('accepts a single-column table', () => {
    const one = '| a |\n| --- |\n| 1 |'
    expect(ctxOf(one).cols).toBe(1)
    expect(ctxOf(one).bodyRows).toBe(1)
  })
})

describe('parseTable', () => {
  it('parses without leading or trailing pipes', () => {
    const src = 'a | b\n--- | ---\n1 | 2'
    expect(parseTable(ctxOf(src))).toEqual([
      ['a', 'b'],
      ['---', '---'],
      ['1', '2']
    ])
  })

  it('parses with both leading and trailing pipes', () => {
    const src = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    expect(parseTable(ctxOf(src))).toEqual([
      ['a', 'b'],
      ['---', '---'],
      ['1', '2']
    ])
  })

  it('trims cells to content without touching inner spacing', () => {
    const src = '|   a b   |  c   |\n| --- | --- |\n| a   b | c |'
    expect(parseTable(ctxOf(src))[0]).toEqual(['a b', 'c'])
  })

  it('does not split on an escaped pipe', () => {
    const src = '| a \\| b | c |\n| --- | --- |\n| x | y |'
    const cells = parseTable(ctxOf(src))
    expect(cells[0]).toEqual(['a \\| b', 'c'])
  })

  it('does not split on a pipe inside a code span', () => {
    const src = '| `a|b` | c |\n| --- | --- |\n| x | y |'
    expect(parseTable(ctxOf(src))[0]).toEqual(['`a|b`', 'c'])
  })

  it('handles pipes in code spans and escaped pipes in the same row', () => {
    const src = '| `a|b` | c \\| d | e |\n| --- | --- | --- |\n| 1 | 2 | 3 |'
    expect(parseTable(ctxOf(src))[0]).toEqual(['`a|b`', 'c \\| d', 'e'])
  })

  it('treats a multi-backtick span as one span', () => {
    const src = '| ``a|`b`` | c |\n| --- | --- |\n| 1 | 2 |'
    expect(parseTable(ctxOf(src))[0]).toEqual(['``a|`b``', 'c'])
  })

  it('pads ragged rows with empty strings', () => {
    const src = '| a | b | c |\n| --- | --- | --- |\n| 1 |'
    expect(parseTable(ctxOf(src))[2]).toEqual(['1', '', ''])
  })

  it('describes a lone pipe as one empty cell, not two', () => {
    const src = '| a | b |\n| --- | --- |\n| |'
    expect(parseTable(ctxOf(src))[2]).toEqual(['', ''])
  })

  it('normalizes CRLF without leaving carriage returns in cells', () => {
    const src = '| a | b |\r\n| --- | --- |\r\n| 1 | 2 |'
    const cells = parseTable(ctxOf(src))
    expect(cells).toEqual([
      ['a', 'b'],
      ['---', '---'],
      ['1', '2']
    ])
    expect(cells.flat().some((c) => c.includes('\r'))).toBe(false)
  })

  it('round-trips a CRLF source to LF without corruption', () => {
    expect(round('| a | b |\r\n| --- | --- |\r\n| 1 | 2 |')).toBe(
      '| a | b |\n| --- | --- |\n| 1 | 2 |'
    )
  })
})

describe('serializeTable', () => {
  it('writes padded pipes', () => {
    const cells = [
      ['a', 'b'],
      ['---', '---'],
      ['1', '2']
    ]
    expect(serializeTable(cells, ['none', 'none'])).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('emits alignment markers', () => {
    const cells = [
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ]
    const out = serializeTable(cells, ['left', 'center', 'right'])
    expect(out.split('\n')[1]).toBe('| :--- | :--: | ---: |')
  })

  it('truncates rows wider than the header', () => {
    const cells = [
      ['a', 'b'],
      ['1', '2', '3']
    ]
    expect(serializeTable(cells, ['none', 'none']).split('\n')[2]).toBe('| 1 | 2 |')
  })

  it('drops a hand-written delimiter row left in the body', () => {
    const cells = [
      ['a', 'b'],
      ['---', '---'],
      ['1', '2']
    ]
    const out = serializeTable(cells, ['none', 'none'])
    expect(out.split('\n').length).toBe(3)
    expect(out.split('\n')[2]).toBe('| 1 | 2 |')
  })

  it('turns embedded newlines into <br>', () => {
    const cells = [['a\nb', 'c']]
    expect(serializeTable(cells, ['none', 'none']).split('\n')[0]).toBe('| a<br>b | c |')
  })

  it('returns an empty string for an empty matrix', () => {
    expect(serializeTable([], [])).toBe('')
  })

  it('pads with pad: true', () => {
    const cells = [
      ['name', 'n'],
      ['a-longer-cell', '1']
    ]
    const out = serializeTable(cells, ['none', 'right'], { pad: true })
    const lines = out.split('\n')
    // Column 0 is 14 wide, column 1 is 3 wide (the delimiter floor).
    expect(lines[0]).toBe('| name          | n   |')
    expect(lines[1]).toBe('| ------------- | --- |')
    expect(lines[2]).toBe('| a-longer-cell | 1   |')
  })

  it('counts CJK cells as two columns wide when padding', () => {
    expect(displayWidth('中文')).toBe(4)
    expect(displayWidth('ab')).toBe(2)
    const cells = [
      ['名称', 'x'],
      ['a', 'y']
    ]
    const out = serializeTable(cells, ['none', 'none'], { pad: true })
    const [header, delim, body] = out.split('\n')
    // 名称 is four terminal columns but two code units, so the padding is two
    // spaces — a naive padEnd would have written four.
    expect(header).toBe('| 名称 | x   |')
    expect(delim).toBe('| ---- | --- |')
    expect(body).toBe('| a    | y   |')
  })
})

describe('suggestColumnWidths', () => {
  it('uses the widest cell, with a floor of 3 for the delimiter', () => {
    expect(suggestColumnWidths([['a'], ['12345']])).toEqual([5])
  })

  it('caps runaway columns', () => {
    expect(suggestColumnWidths([['x'.repeat(200)]])).toEqual([40])
  })

  it('covers every column even when rows are ragged', () => {
    expect(suggestColumnWidths([['a'], ['b', 'ccccc']]).length).toBe(2)
  })
})

describe('escapePipes', () => {
  it('escapes bare pipes and leaves escaped ones alone', () => {
    expect(escapePipes('a|b')).toBe('a\\|b')
    expect(escapePipes('a\\|b')).toBe('a\\|b')
  })
})

describe('replaceTable', () => {
  const src = 'before\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter'

  it('replaces only the table block', () => {
    const ctx = ctxOf(src, src.indexOf('1 | 2'))
    const cells = setCell(parseTable(ctx), { row: 2, col: 0 }, '9')
    const { text } = replaceTable(src, ctx, cells, ctx.aligns)
    expect(text).toBe('before\n\n| a | b |\n| --- | --- |\n| 9 | 2 |\n\nafter')
  })

  it('leaves the surrounding text untouched', () => {
    const ctx = ctxOf(src, src.indexOf('1 | 2'))
    const { text } = replaceTable(src, ctx, parseTable(ctx), ctx.aligns)
    expect(text).toBe(src)
  })

  it('places the cursor inside the edited cell', () => {
    const ctx = ctxOf(src, src.indexOf('1 | 2'))
    const cells = setCell(parseTable(ctx), { row: 2, col: 0 }, '12345')
    const { text, cursor } = replaceTable(src, ctx, cells, ctx.aligns, {
      cursor: src.indexOf('1 | 2') + 1
    })
    expect(text.slice(cursor - 1, cursor + 1)).toBe('23')
  })

  it('keeps the cursor sane after a row insert', () => {
    const ctx = ctxOf(src, src.indexOf('1 | 2'))
    const cells = insertRow(parseTable(ctx), 2, true)
    const { cursor } = replaceTable(src, ctx, cells, ctx.aligns, {
      cursor: src.indexOf('2 |')
    })
    expect(cursor).toBeGreaterThan(0)
    expect(cursor).toBeLessThan(src.length + 10)
  })
})

describe('structural ops', () => {
  const base = [
    ['h1', 'h2'],
    ['a', 'b'],
    ['c', 'd']
  ]

  it('insertRow after an index', () => {
    expect(insertRow(base, 1)).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
      ['', ''],
      ['c', 'd']
    ])
  })

  it('insertRow before an index', () => {
    expect(insertRow(base, 1, true)).toEqual([
      ['h1', 'h2'],
      ['', ''],
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  it('insertRow clamps out-of-bounds indices', () => {
    expect(insertRow(base, 99).length).toBe(4)
    expect(insertRow(base, -5, true)[0]).toEqual(['', ''])
  })

  it('insertCol at the end and start', () => {
    expect(insertCol(base, 1).map((r) => r.length)).toEqual([3, 3, 3])
    expect(insertCol(base, 0, true)[0]).toEqual(['', 'h1', 'h2'])
  })

  it('deleteRow removes one row', () => {
    expect(deleteRow(base, 1)).toEqual([
      ['h1', 'h2'],
      ['c', 'd']
    ])
  })

  it('deleteRow on the only row returns a sane one-row table', () => {
    expect(deleteRow([['h1', 'h2']], 0)).toEqual([['', '']])
  })

  it('deleteRow out of bounds is a no-op', () => {
    expect(deleteRow(base, 9)).toEqual(base)
  })

  it('deleteCol removes one column from every row', () => {
    expect(deleteCol(base, 0)).toEqual([['h2'], ['b'], ['d']])
  })

  it('deleteCol refuses to remove the last column', () => {
    expect(deleteCol([['only'], ['x']], 0)).toEqual([[''], ['']])
  })

  it('moveRow moves down and up', () => {
    expect(moveRow(base, 1, 2)[1]).toEqual(['c', 'd'])
    expect(moveRow(base, 2, 1)[1]).toEqual(['c', 'd'])
  })

  it('moveRow clamps beyond bounds and is identity when equal', () => {
    expect(moveRow(base, 1, 99)[2]).toEqual(['a', 'b'])
    expect(moveRow(base, 1, 1)).toEqual(base)
  })

  it('moveCol moves between columns', () => {
    expect(moveCol(base, 0, 1)).toEqual([
      ['h2', 'h1'],
      ['b', 'a'],
      ['d', 'c']
    ])
  })

  it('moveCol clamps out-of-bounds indices', () => {
    expect(moveCol(base, 0, 99)).toEqual([
      ['h2', 'h1'],
      ['b', 'a'],
      ['d', 'c']
    ])
    expect(moveCol(base, 5, 0)).toEqual(base)
  })

  it('transpose flips rows and columns', () => {
    expect(transpose(base)).toEqual([
      ['h1', 'a', 'c'],
      ['h2', 'b', 'd']
    ])
  })

  it('transpose of an empty matrix stays empty', () => {
    expect(transpose([])).toEqual([])
  })

  it('transpose twice is the identity', () => {
    expect(transpose(transpose(base))).toEqual(base)
  })

  it('every op leaves the input untouched', () => {
    const snapshot = JSON.stringify(base)
    insertRow(base, 0)
    insertCol(base, 0)
    deleteRow(base, 0)
    deleteCol(base, 0)
    moveRow(base, 0, 2)
    moveCol(base, 0, 1)
    transpose(base)
    sortByColumn(base, 0)
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('cell content ops', () => {
  const base = [
    ['h1', 'h2'],
    ['a', 'b']
  ]

  it('setCell writes one cell', () => {
    expect(setCell(base, { row: 1, col: 1 }, 'z')[1]).toEqual(['a', 'z'])
  })

  it('setColumnAlign extends the align list as needed', () => {
    expect(setColumnAlign([], 1, 'right')).toEqual(['none', 'right'])
  })

  it('setHeaderRow(true) inserts an empty header when needed', () => {
    expect(setHeaderRow([['a', 'b']], true)[0]).toEqual(['', ''])
  })

  it('setHeaderRow(true) is a no-op when the header is already empty', () => {
    const cells = [
      ['', ''],
      ['a', 'b']
    ]
    expect(setHeaderRow(cells, true)).toEqual(cells)
  })

  it('setHeaderRow(false) drops an empty header into the body', () => {
    const cells = [
      ['', ''],
      ['a', 'b']
    ]
    expect(setHeaderRow(cells, false)).toEqual([['a', 'b']])
  })

  it('setHeaderRow(false) keeps a blank header row for validity', () => {
    const cells = [
      ['h', 'i'],
      ['a', 'b']
    ]
    expect(setHeaderRow(cells, false)).toEqual([
      ['', ''],
      ['h', 'i'],
      ['a', 'b']
    ])
  })

  it('mergeRight emits colspan and blanks the covered cells', () => {
    const cells = [
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ]
    const merged = mergeRight(cells, { row: 0, col: 0 }, 2)
    expect(merged[0]).toEqual(['<td colspan="2">a b</td>', '', 'c'])
  })

  it('mergeRight clamps to the last column and ignores span < 2', () => {
    const cells = [
      ['a', 'b'],
      ['1', '2']
    ]
    expect(mergeRight(cells, { row: 0, col: 1 }, 5)[0]).toEqual(['a', 'b'])
    expect(mergeRight(cells, { row: 0, col: 0 }, 1)).toEqual(cells)
  })

  it('mergeDown emits rowspan and blanks the covered cells', () => {
    const cells = [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f']
    ]
    const merged = mergeDown(cells, { row: 0, col: 0 }, 2)
    expect(merged[0][0]).toBe('<td rowspan="2">a c</td>')
    expect(merged[1][0]).toBe('')
    expect(merged[2][0]).toBe('e')
  })

  it('mergeDown clamps to the last row', () => {
    const cells = [
      ['a'],
      ['b']
    ]
    expect(mergeDown(cells, { row: 1, col: 0 }, 3)).toEqual([['a'], ['b']])
  })

  it('splitCell reverses a colspan', () => {
    const cells = [['<td colspan="2">a b</td>', ''], ['1', '2']]
    expect(splitCell(cells, { row: 0, col: 0 })[0]).toEqual(['a b', ''])
  })

  it('splitCell reverses a rowspan', () => {
    const cells = [['<td rowspan="2">a c</td>', 'b'], [''], ['e']]
    expect(splitCell(cells, { row: 0, col: 0 })[0][0]).toBe('a c')
  })

  it('splitCell on a plain cell is a no-op', () => {
    const cells = [['plain']]
    expect(splitCell(cells, { row: 0, col: 0 })).toEqual(cells)
  })

  it('isMerged recognizes the emitted forms only', () => {
    expect(isMerged('<td colspan="2">x</td>')).toBe(true)
    expect(isMerged('<td rowspan="3">x</td>')).toBe(true)
    expect(isMerged('plain')).toBe(false)
    expect(isMerged('<td colspan="2">x')).toBe(false)
  })
})

describe('sortByColumn', () => {
  it('sorts numbers numerically, not lexically', () => {
    const cells = [
      ['n'],
      ['10'],
      ['9'],
      ['100'],
      ['2']
    ]
    expect(sortByColumn(cells, 0, 'asc', { hasHeader: true }).slice(1).map((r) => r[0])).toEqual([
      '2',
      '9',
      '10',
      '100'
    ])
  })

  it('sorts dates chronologically', () => {
    const cells = [
      ['d'],
      ['2024-03-01'],
      ['2023-12-31'],
      ['2024-01-15']
    ]
    expect(sortByColumn(cells, 0, 'asc', { hasHeader: true }).slice(1).map((r) => r[0])).toEqual([
      '2023-12-31',
      '2024-01-15',
      '2024-03-01'
    ])
  })

  it('sorts YYYY/MM/DD dates as dates too', () => {
    const cells = [
      ['d'],
      ['2024/2/1'],
      ['2023/10/05']
    ]
    expect(sortByColumn(cells, 0, 'asc', { hasHeader: true }).slice(1).map((r) => r[0])).toEqual([
      '2023/10/05',
      '2024/2/1'
    ])
  })

  it('falls back to string order when the column mixes types', () => {
    const cells = [
      ['v'],
      ['b'],
      ['a'],
      ['10']
    ]
    const out = sortByColumn(cells, 0, 'asc', { hasHeader: true }).slice(1).map((r) => r[0])
    expect(out[0]).toBe('10')
    expect(out.slice(1)).toEqual(['a', 'b'])
  })

  it('sorts descending', () => {
    const cells = [
      ['n'],
      ['1'],
      ['3'],
      ['2']
    ]
    expect(sortByColumn(cells, 0, 'desc', { hasHeader: true }).slice(1).map((r) => r[0])).toEqual([
      '3',
      '2',
      '1'
    ])
  })

  it('always sinks empty cells last, in both directions', () => {
    const cells = [
      ['n'],
      ['3'],
      [''],
      ['1']
    ]
    expect(sortByColumn(cells, 0, 'asc', { hasHeader: true }).map((r) => r[0])).toEqual([
      'n',
      '1',
      '3',
      ''
    ])
    expect(sortByColumn(cells, 0, 'desc', { hasHeader: true }).map((r) => r[0])).toEqual([
      'n',
      '3',
      '1',
      ''
    ])
  })

  it('keeps ties in their original order', () => {
    const cells = [
      ['n', 'tag'],
      ['1', 'first'],
      ['1', 'second'],
      ['1', 'third']
    ]
    expect(
      sortByColumn(cells, 0, 'asc', { hasHeader: true })
        .slice(1)
        .map((r) => r[1])
    ).toEqual(['first', 'second', 'third'])
  })

  it('sorts the whole matrix without a header when hasHeader is off', () => {
    const cells = [
      ['2', 'b'],
      ['1', 'a']
    ]
    expect(sortByColumn(cells, 0, 'asc')[0]).toEqual(['1', 'a'])
  })

  it('tolerates short rows when reading the key column', () => {
    const cells = [
      ['n'],
      ['2'],
      []
    ]
    expect(sortByColumn(cells, 0, 'asc', { hasHeader: true }).length).toBe(3)
  })
})

describe('CSV interop', () => {
  it('quotes fields containing the delimiter, quotes or newlines', () => {
    const cells = [['a,b', 'say "hi"', 'x\ny']]
    expect(toCsv(cells)).toBe('"a,b","say ""hi""","x\ny"')
  })

  it('leaves plain fields unquoted', () => {
    expect(toCsv([['a', 'b']])).toBe('a,b')
  })

  it('round-trips through fromDelimited', () => {
    const cells = [
      ['a,b', 'q"q'],
      ['1', '2']
    ]
    expect(fromDelimited(toCsv(cells))).toEqual(cells)
  })

  it('round-trips a field with an embedded newline', () => {
    const cells = [['x\ny', 'z']]
    expect(fromDelimited(toCsv(cells))).toEqual(cells)
  })

  it('sniffs tab-separated text', () => {
    const text = 'a\tb\tc\n1\t2\t3'
    expect(fromDelimited(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ])
  })

  it('sniffs commas', () => {
    expect(fromDelimited('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('sniffs semicolons', () => {
    expect(fromDelimited('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('sniffs pipes and strips the outer ones', () => {
    expect(fromDelimited('| a | b |\n| 1 | 2 |')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('prefers the delimiter with a consistent per-line count', () => {
    const text = 'a,b;c\n1,2;3'
    expect(fromDelimited(text)).toEqual([
      ['a', 'b;c'],
      ['1', '2;3']
    ])
  })

  it('honors an explicit delimiter', () => {
    expect(fromDelimited('a|b', '|')).toEqual([['a', 'b']])
  })

  it('pads ragged input into a rectangle', () => {
    expect(fromDelimited('a,b,c\n1,2')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '']
    ])
  })

  it('drops a trailing empty line', () => {
    expect(fromDelimited('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('extracts a pasted HTML table', () => {
    const html =
      '<table><tr><td>Name</td><td>Age</td></tr><tr><td>Ann</td><td>30</td></tr></table>'
    expect(fromDelimited(html)).toEqual([
      ['Name', 'Age'],
      ['Ann', '30']
    ])
  })

  it('extracts th cells and strips nested markup plus entities', () => {
    const html =
      '<table><thead><tr><th>a &amp; b</th></tr></thead><tbody><tr><td><b>x</b><br>y</td></tr></tbody></table>'
    expect(fromDelimited(html)).toEqual([['a & b'], ['x<br>y']])
  })

  it('falls back to sniffing when HTML has no table', () => {
    expect(fromDelimited('<p>a</p>,b')).toEqual([['<p>a</p>', 'b']])
  })
})

describe('JSON interop', () => {
  const cells = [
    ['name', 'age'],
    ['Ann', '30'],
    ['Bo', '25']
  ]

  it('keys body rows by the header row', () => {
    expect(toJson(cells)).toEqual([
      { name: 'Ann', age: '30' },
      { name: 'Bo', age: '25' }
    ])
  })

  it('returns nothing for a header-only table', () => {
    expect(toJson([['a', 'b']])).toEqual([])
  })

  it('round-trips through fromJson', () => {
    expect(fromJson(toJson(cells))).toEqual(cells)
  })

  it('accepts a JSON string', () => {
    expect(fromJson('[{"a":"1"}]')).toEqual([['a'], ['1']])
  })

  it('unions keys across rows', () => {
    expect(fromJson([{ a: '1' }, { b: '2' }])).toEqual([
      ['a', 'b'],
      ['1', ''],
      ['', '2']
    ])
  })

  it('stringifies nested values', () => {
    expect(fromJson([{ a: { b: 1 } }])).toEqual([['a'], ['{"b":1}']])
  })

  it('treats null and undefined as empty', () => {
    expect(fromJson([{ a: null, b: undefined }])).toEqual([
      ['a', 'b'],
      ['', '']
    ])
  })

  it('returns an empty matrix for an empty array', () => {
    expect(fromJson([])).toEqual([])
  })
})

describe('list interop', () => {
  const cells = [
    ['名称', '数量'],
    ['苹果', '3'],
    ['梨', '5']
  ]

  it('writes one bullet per field with a fullwidth colon', () => {
    expect(toList(cells)).toBe('- 名称：苹果\n- 数量：3\n\n- 名称：梨\n- 数量：5')
  })

  it('round-trips through fromList with explicit headers', () => {
    expect(fromList(toList(cells), ['名称', '数量'])).toEqual(cells)
  })

  it('discovers headers and rows when none are supplied', () => {
    expect(fromList(toList(cells))).toEqual(cells)
  })

  it('ignores non-list lines', () => {
    expect(fromList('prose\n- a：1', ['a'])).toEqual([['a'], ['1']])
  })

  it('returns an empty matrix when nothing parses', () => {
    expect(fromList('no bullets here')).toEqual([])
  })

  it('keeps a value that itself contains a colon', () => {
    expect(fromList('- k：a：b', ['k'])).toEqual([['k'], ['a：b']])
  })
})

describe('formatting', () => {
  it('padTable produces aligned pipes', () => {
    const cells = [
      ['a', 'bbbb'],
      ['ccc', 'd']
    ]
    const out = padTable(cells, ['none', 'none'])
    const lines = out.split('\n')
    expect(lines[1]).toBe('| --- | ---- |')
    expect(lines[0]).toBe('| a   | bbbb |')
    expect(lines[2]).toBe('| ccc | d    |')
  })

  it('padTable output re-parses to the same cells', () => {
    const cells = [
      ['名称', 'qty'],
      ['苹果', '3']
    ]
    const padded = padTable(cells, ['none', 'right'])
    const src = padded + '\n'
    expect(parseTable(ctxOf(src))).toEqual([
      ['名称', 'qty'],
      ['---', '---:'],
      ['苹果', '3']
    ])
  })

  it('every padded column is the same display width', () => {
    const cells = [
      ['名称', 'q'],
      ['a', 'bbbbb']
    ]
    const lines = padTable(cells, ['none', 'none']).split('\n')
    const widths = lines.map((l) => displayWidth(l))
    expect(new Set(widths).size).toBe(1)
  })

  it('appendStatsRow sums a column', () => {
    const cells = [
      ['name', 'n'],
      ['a', '2'],
      ['b', '3']
    ]
    expect(appendStatsRow(cells, 1, 'sum').at(-1)).toEqual(['合计', '5'])
  })

  it('appendStatsRow averages, counts, mins and maxes', () => {
    const cells = [
      ['name', 'n'],
      ['a', '2'],
      ['b', '4']
    ]
    expect(appendStatsRow(cells, 1, 'avg').at(-1)?.[1]).toBe('3')
    expect(appendStatsRow(cells, 1, 'count').at(-1)?.[1]).toBe('2')
    expect(appendStatsRow(cells, 1, 'min').at(-1)?.[1]).toBe('2')
    expect(appendStatsRow(cells, 1, 'max').at(-1)?.[1]).toBe('4')
  })

  it('appendStatsRow ignores non-numeric cells', () => {
    const cells = [
      ['name', 'n'],
      ['a', '2'],
      ['b', 'oops'],
      ['c', '']
    ]
    expect(appendStatsRow(cells, 1, 'sum').at(-1)?.[1]).toBe('2')
  })

  it('appendStatsRow writes into the column itself when it is not column 0', () => {
    const cells = [
      ['name', 'n'],
      ['a', '2']
    ]
    expect(appendStatsRow(cells, 0, 'count').at(-1)).toEqual(['计数', '1'])
  })

  it('appendStatsRow leaves a blank label for a single-column table', () => {
    const cells = [['n'], ['2']]
    expect(appendStatsRow(cells, 0, 'sum').at(-1)).toEqual(['2'])
  })
})

describe('normalizeRows', () => {
  it('rectangles ragged rows', () => {
    expect(normalizeRows([['a'], ['b', 'c']])).toEqual([
      ['a', ''],
      ['b', 'c']
    ])
  })
})
