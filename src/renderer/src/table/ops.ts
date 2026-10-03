/**
 * Table edit operations. Every function is pure: it returns new cells/aligns
 * (or a whole new source string) and never mutates its arguments.
 *
 * Cell text is stored exactly as it appears in the markdown source, so the
 * values produced here can be handed straight back to `serializeTable`.
 */

import { serializeTable, type Align, type CellPos } from './model'

type Cells = string[][]

export type SortDir = 'asc' | 'desc'
export type StatsKind = 'sum' | 'avg' | 'count' | 'min' | 'max'

const MERGE_RE = /^<t[dh]\s+(colspan|rowspan)="(\d+)"\s*>([\s\S]*)<\/t[dh]>$/

const EMPTY_ROW = (cols: number): string[] => Array.from({ length: cols }, () => '')

function colCount(cells: Cells): number {
  return cells.reduce((m, r) => Math.max(m, r.length), 0)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

/** Insert `value` at `at`, or directly before it when `before` is set. */
function insertAt<T>(list: T[], at: number, value: T, before: boolean): T[] {
  const out = list.slice()
  if (before) {
    out.splice(clamp(at, 0, out.length), 0, value)
    return out
  }
  const i = clamp(at, -1, out.length - 1) + 1
  out.splice(i, 0, value)
  return out
}

export function insertRow(cells: Cells, at: number, before = false): Cells {
  const cols = colCount(cells)
  return insertAt(cells, at, EMPTY_ROW(cols), before)
}

export function insertCol(cells: Cells, at: number, before = false): Cells {
  const cols = colCount(cells)
  return cells.map((row) => {
    const padded = row.slice()
    while (padded.length < cols) padded.push('')
    return insertAt(padded, at, '', before)
  })
}

export function deleteRow(cells: Cells, at: number): Cells {
  if (cells.length === 0) return []
  const out = cells.filter((_, i) => i !== at)
  // The header and delimiter rows are structural — never drop both.
  if (out.length === 0) return [EMPTY_ROW(colCount(cells))]
  return out
}

export function deleteCol(cells: Cells, at: number): Cells {
  const cols = colCount(cells)
  if (cols <= 1) return cells.map(() => [''])
  return cells.map((row) => {
    const padded = row.slice()
    while (padded.length < cols) padded.push('')
    return padded.filter((_, i) => i !== at)
  })
}

export function moveRow(cells: Cells, from: number, to: number): Cells {
  // Out-of-range indices are caller mistakes — leave the table alone rather
  // than snapping the row to an edge. `moveCol` follows the same rule.
  if (from < 0 || from >= cells.length || to < 0 || to >= cells.length) {
    return cells.map((r) => r.slice())
  }
  if (from === to) return cells.map((r) => r.slice())
  const out = cells.slice()
  const [row] = out.splice(from, 1)
  out.splice(to, 0, row)
  return out
}

export function moveCol(cells: Cells, from: number, to: number): Cells {
  const cols = colCount(cells)
  if (cols === 0) return []
  // An out-of-range target is a caller mistake, not "move it to the edge":
  // dragging a column past the last one should leave the table alone.
  if (from < 0 || from >= cols || to < 0 || to >= cols) {
    return cells.map((row) => {
      const r = row.slice()
      while (r.length < cols) r.push('')
      r.length = cols
      return r
    })
  }
  const padded = cells.map((row) => {
    const r = row.slice()
    while (r.length < cols) r.push('')
    r.length = cols
    return r
  })
  if (from === to) return padded
  return padded.map((row) => {
    const out = row.slice()
    const [v] = out.splice(from, 1)
    out.splice(to, 0, v)
    return out
  })
}

export function transpose(cells: Cells): Cells {
  const cols = colCount(cells)
  if (cols === 0) return []
  return Array.from({ length: cols }, (_, c) => cells.map((row) => row[c] ?? ''))
}

export function setCell(cells: Cells, pos: CellPos, value: string): Cells {
  return cells.map((row, r) => {
    if (r !== pos.row) return row.slice()
    const out = row.slice()
    out[pos.col] = value
    return out
  })
}

/** Empty the cell but leave the row and column structure alone. */
export function clearCell(cells: Cells, pos: CellPos): Cells {
  const row = cells[pos.row]
  if (!row || pos.col < 0 || pos.col >= row.length) return cells.map((r) => r.slice())
  return setCell(cells, pos, '')
}

const TRAILING_BREAK = /(?:<br\s*\/?>)+$/i

/**
 * Toggle a `<br>` at the end of a cell — the only way markdown holds two lines
 * in one cell. Toggling rather than appending keeps a second press from
 * stacking a run of breaks the user did not ask for.
 */
export function toggleCellNewline(cells: Cells, pos: CellPos): Cells {
  const row = cells[pos.row]
  if (!row || pos.col < 0 || pos.col >= row.length) return cells.map((r) => r.slice())
  const value = row[pos.col]
  return setCell(cells, pos, TRAILING_BREAK.test(value) ? value.replace(TRAILING_BREAK, '') : value + '<br>')
}

/** One row as a standalone, pasteable table with a real header row. */
export function rowAsTable(cells: Cells, row: number, aligns: Align[]): string {
  const line = cells[row]
  if (!line) return ''
  // The header is its own header; anything below it needs the real one above,
  // or the pasted markdown would not parse as a table at all.
  if (row === 0) return serializeTable([line], aligns)
  const width = colCount(cells)
  const header = Array.from({ length: width }, (_, c) => cells[0]?.[c] ?? '')
  return serializeTable([header, line], aligns)
}

/** The row's markdown and the matrix with that row removed. */
export function cutRow(
  cells: Cells,
  row: number,
  aligns: Align[]
): { markdown: string; cells: Cells } {
  return { markdown: rowAsTable(cells, row, aligns), cells: deleteRow(cells, row) }
}

/* ---- rendering styles --------------------------------------------------- */

export type TableStyle = 'zebra' | 'compact' | 'borderless' | 'card' | 'center'

/**
 * Visual weight is one slot: a row cannot be striped and a card at once.
 * The rest are independent flags, so they compose freely.
 */
const EXCLUSIVE: TableStyle[] = ['zebra', 'card']

/**
 * Plain markdown has nowhere to store how a table should look, so the style
 * rides along in an HTML comment on the line after the block. `findTableAt`
 * stops before it, which is what keeps it out of `parseTable` and lets
 * `serializeTable` round-trip the table without touching it.
 */
const MARKER_RE = /^\s*<!--\s*mdview:table\s+style=([^>]*?)\s*-->\s*$/

const STYLES: TableStyle[] = ['zebra', 'compact', 'borderless', 'card', 'center']

function isStyle(v: string): v is TableStyle {
  return (STYLES as string[]).includes(v)
}

function stylesFromMarker(line: string): TableStyle[] {
  const m = MARKER_RE.exec(line)
  if (!m) return []
  const found = m[1].split(',').map((s) => s.trim()).filter(isStyle)
  // A hand-edited `style=zebra,card` keeps the first and drops the second,
  // so reading is as exclusive as writing.
  const visual = EXCLUSIVE.filter((s) => found.includes(s)).slice(0, 1)
  return [...visual, ...found.filter((s) => !EXCLUSIVE.includes(s))]
}

function markerLine(styles: TableStyle[]): string {
  return `<!-- mdview:table style=${styles.join(',')} -->`
}

/**
 * Offsets of the marker line when the table carries one. `ctx.end` sits at the
 * end of the table's own last line, so the marker — if it exists — is the line
 * after that, never the first thing past `end`.
 */
function markerSpan(src: string, end: number): { start: number; end: number } | null {
  const after = src.slice(end)
  const lineBreak = after.indexOf('\n')
  if (lineBreak === -1) return null
  const start = end + lineBreak + 1
  const rest = src.slice(start)
  const nextBreak = rest.indexOf('\n')
  const line = nextBreak === -1 ? rest : rest.slice(0, nextBreak)
  if (!MARKER_RE.test(line)) return null
  return { start, end: nextBreak === -1 ? src.length : start + nextBreak }
}

/**
 * Offset just past the table block, taking a trailing marker line with it.
 * Deliberately not folded into `TableContext.end`: `end` marks where the
 * table's own text stops, and moving it would change `ctx.raw` for every
 * document that has a style.
 */
export function tableRegionEnd(src: string, end: number): number {
  return markerSpan(src, end)?.end ?? end
}

/** The style the table carries, empty when it has never been styled. */
export function tableStyles(src: string, ctx: { end: number }): TableStyle[] {
  const span = markerSpan(src, ctx.end)
  return span ? stylesFromMarker(src.slice(span.start, span.end)) : []
}

/** Apply, clear or drop the marker line after the table block. */
export function setTableStyle(src: string, ctx: { end: number }, style: TableStyle, on: boolean): string {
  const span = markerSpan(src, ctx.end)
  const present = span ? stylesFromMarker(src.slice(span.start, span.end)) : []

  let next = present
  if (on) {
    // Choosing one visual weight replaces the other rather than sitting beside
    // it, so a marker can never read `style=zebra,card`. Only the visual styles
    // displace anything; the flags compose.
    next = EXCLUSIVE.includes(style) ? present.filter((s) => !EXCLUSIVE.includes(s)) : present
    if (!next.includes(style)) next = [...next, style]
  } else {
    next = present.filter((s) => s !== style)
  }

  if (next.length === 0) {
    // Dropping the last style takes the whole line with its line break, so the
    // blank line that followed the table is what remains.
    if (!span) return src
    const tail = src.slice(span.end)
    const head = src.slice(0, span.start)
    return tail.startsWith('\n') ? head + tail.slice(1) : head + tail
  }

  const line = markerLine(next)
  if (span) return src.slice(0, span.start) + line + src.slice(span.end)
  // A table that ends the document has no line to insert before, so the marker
  // is appended; otherwise it takes the slot directly under the table and
  // whatever followed the table keeps its own line.
  const after = src.slice(ctx.end)
  const lineBreak = after.indexOf('\n')
  if (lineBreak === -1) return src + '\n' + line
  return src.slice(0, ctx.end + lineBreak + 1) + line + '\n' + src.slice(ctx.end + lineBreak + 1)
}

export function setColumnAlign(aligns: Align[], col: number, align: Align): Align[] {
  const out = aligns.slice()
  while (out.length <= col) out.push('none')
  out[col] = align
  return out
}

/**
 * Toggle the first row between header and body. Markdown has no way to hold a
 * body row above the header, so turning the header off inserts an empty header
 * row and demotes the old one into the body.
 */
export function setHeaderRow(cells: Cells, on: boolean): Cells {
  const cols = colCount(cells)
  const blank = (): string[] => EMPTY_ROW(cols)
  if (on) {
    if (cells.length > 1 && cells[0].every((c) => c === '')) return cells.map((r) => r.slice())
    return [blank(), ...cells.map((r) => r.slice())]
  }
  // Turning it off needs a header row to stay valid markdown, so an empty one
  // is left behind and the old header content becomes the first body row.
  if (cells.length > 1 && cells[0].every((c) => c === '')) return cells.slice(1).map((r) => r.slice())
  return [blank(), ...cells.map((r) => r.slice())]
}

export function isMerged(cell: string): boolean {
  return MERGE_RE.test(cell)
}

/** Merge `span` cells rightwards into `pos`, blanking the covered cells. */
export function mergeRight(cells: Cells, pos: CellPos, span = 2): Cells {
  if (span < 2) return cells
  const row = cells[pos.row]
  if (!row) return cells
  const width = colCount(cells)
  const end = Math.min(pos.col + span - 1, width - 1)
  if (end <= pos.col) return cells
  const content = row.slice(pos.col, end + 1).join(' ')
  return cells.map((r, i) => {
    if (i !== pos.row) return r.slice()
    const out = r.slice()
    while (out.length < width) out.push('')
    out[pos.col] = `<td colspan="${end - pos.col + 1}">${content}</td>`
    for (let c = pos.col + 1; c <= end; c++) out[c] = ''
    return out
  })
}

/** Merge `span` cells downwards into `pos`, blanking the covered cells. */
export function mergeDown(cells: Cells, pos: CellPos, span = 2): Cells {
  if (span < 2) return cells
  const end = Math.min(pos.row + span - 1, cells.length - 1)
  if (end <= pos.row) return cells
  const width = colCount(cells)
  const parts: string[] = []
  for (let r = pos.row; r <= end; r++) parts.push(cells[r][pos.col] ?? '')
  const content = parts.filter((p) => p !== '').join(' ')
  return cells.map((r, i) => {
    const out = r.slice()
    while (out.length < width) out.push('')
    if (i === pos.row) out[pos.col] = `<td rowspan="${end - pos.row + 1}">${content}</td>`
    else if (i <= end) out[pos.col] = ''
    return out
  })
}

/** Reverse a merge, dropping the span attribute but keeping the content. */
export function splitCell(cells: Cells, pos: CellPos): Cells {
  const row = cells[pos.row]
  if (!row) return cells
  const m = MERGE_RE.exec(row[pos.col] ?? '')
  if (!m) return cells
  return cells.map((r, i) => {
    if (i !== pos.row) return r.slice()
    const out = r.slice()
    out[pos.col] = m[3]
    return out
  })
}

function toNumber(v: string): number | null {
  const s = v.replace(/,/g, '').trim()
  if (s === '') return null
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?%?$/.test(s)) return null
  const n = Number(s.endsWith('%') ? s.slice(0, -1) : s)
  return Number.isFinite(n) ? n : null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/
const SLASH_DATE = /^\d{4}\/\d{1,2}\/\d{1,2}$/

function toTime(v: string): number | null {
  const s = v.trim()
  if (!ISO_DATE.test(s) && !SLASH_DATE.test(s)) return null
  const d = new Date(s.replace(/\//g, '-').replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

function columnKind(values: string[]): 'number' | 'date' | 'string' {
  const filled = values.filter((v) => v.trim() !== '')
  if (filled.length === 0) return 'string'
  if (filled.every((v) => toNumber(v) !== null)) return 'number'
  if (filled.every((v) => toTime(v) !== null)) return 'date'
  return 'string'
}

/**
 * Sort by one column, detecting number/date/string from the values. Empty
 * cells always sink to the bottom, and ties keep their original order.
 */
export function sortByColumn(
  cells: Cells,
  col: number,
  dir: SortDir = 'asc',
  opts?: { hasHeader?: boolean }
): Cells {
  if (cells.length === 0) return []
  const hasHeader = opts?.hasHeader === true
  const header = hasHeader ? cells.slice(0, 1) : []
  const body = hasHeader ? cells.slice(1) : cells.slice()
  const kind = columnKind(body.map((r) => r[col] ?? ''))
  const sign = dir === 'desc' ? -1 : 1

  const key = (v: string): number | string | null => {
    if (v.trim() === '') return null
    if (kind === 'number') return toNumber(v)
    if (kind === 'date') return toTime(v)
    return v
  }

  const decorated = body.map((row, i) => ({ row, i, k: key(row[col] ?? '') }))
  decorated.sort((a, b) => {
    // Ascending puts blanks last; descending mirrors that, blanks stay last.
    if (a.k === null || b.k === null) {
      if (a.k === null && b.k === null) return a.i - b.i
      return a.k === null ? 1 : -1
    }
    let cmp: number
    if (typeof a.k === 'string' && typeof b.k === 'string') cmp = a.k.localeCompare(b.k, 'zh-Hans-CN')
    else cmp = (a.k as number) - (b.k as number)
    if (cmp === 0) return a.i - b.i
    return sign * cmp
  })

  return [...header, ...decorated.map((d) => d.row)]
}

/* ---- data interop ------------------------------------------------------- */

function sniffDelimiter(text: string): string {
  const candidates = ['\t', ',', '|', ';']
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '')
  let best = ','
  let bestScore = -1
  for (const d of candidates) {
    if (!lines.some((l) => l.includes(d))) continue
    const counts = lines.map((l) => l.split(d).length - 1)
    const mode = counts[0]
    const consistent = counts.every((c) => c === mode)
    const score = (consistent ? 1000 : 0) + mode
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

function splitDelimitedLine(line: string, delim: string): string[] {
  if (delim === '|') {
    return line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim())
  }
  return line.split(delim).map((c) => c.trim())
}

/** Minimal CSV/TSV reader: handles quotes, escaped quotes and embedded newlines. */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') {
      quoted = true
      continue
    }
    if (ch === delim) {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    if (ch === '\r') continue
    field += ch
  }
  row.push(field)
  rows.push(row)
  if (rows.length > 1 && rows[rows.length - 1].every((c) => c === '')) rows.pop()
  return rows.map((r) => r.map((c) => c.trim()))
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Excel and web tables paste as HTML — pull the grid out before sniffing. */
function fromHtmlTables(html: string): string[][] | null {
  const tableMatch = /<table[\s\S]*?<\/table>/i.exec(html)
  if (!tableMatch) return null
  const rows: string[][] = []
  const trRe = /<tr[\s\S]*?<\/tr>/gi
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  let tr: RegExpExecArray | null
  while ((tr = trRe.exec(tableMatch[0]))) {
    const cells: string[] = []
    let td: RegExpExecArray | null
    cellRe.lastIndex = 0
    while ((td = cellRe.exec(tr[0]))) {
      // `<br>` is the only tag that carries meaning into a cell — it is how a
      // line break survives. Park it out of reach of the tag stripper.
      const text = decodeEntities(
        td[1].replace(/<br\s*\/?>/gi, '\u0000').replace(/<[^>]+>/g, '')
      )
        .replace(/\u0000/g, '<br>')
        .replace(/ /g, ' ')
        .trim()
      cells.push(text)
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows.length > 0 ? rows : null
}

/** Normalize ragged rows to a rectangle (row 0 = header). */
export function normalizeRows(rows: string[][]): string[][] {
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0)
  return rows.map((r) => {
    const out = r.slice(0, cols)
    while (out.length < cols) out.push('')
    return out
  })
}

export function fromDelimited(text: string, delimiter?: string): Cells {
  if (/<table/i.test(text)) {
    const html = fromHtmlTables(text)
    if (html) return normalizeRows(html)
  }
  const delim = delimiter ?? sniffDelimiter(text)
  if (delim === '|') {
    return normalizeRows(
      text
        .split(/\r\n|\r|\n/)
        .filter((l) => l.trim() !== '')
        .map((l) => splitDelimitedLine(l, '|'))
    )
  }
  return normalizeRows(parseDelimited(text, delim))
}

function quoteField(v: string, delim: string): string {
  if (v.includes(delim) || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

export function toCsv(cells: Cells, delimiter = ','): string {
  return cells
    .map((row) => row.map((v) => quoteField(v, delimiter)).join(delimiter))
    .join('\n')
}

export function toJson(cells: Cells): Record<string, string>[] {
  if (cells.length === 0) return []
  const headers = cells[0]
  return cells.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, c) => {
      obj[h] = row[c] ?? ''
    })
    return obj
  })
}

export function fromJson(rows: Record<string, unknown>[] | string): Cells {
  const data = typeof rows === 'string' ? (JSON.parse(rows) as Record<string, unknown>[]) : rows
  if (!Array.isArray(data) || data.length === 0) return []
  const headers: string[] = []
  for (const row of data) {
    for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k)
  }
  const body = data.map((row) => headers.map((h) => stringify(row[h])))
  return [headers, ...body]
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const LIST_RE = /^\s*[-*+]\s*(.*)$/
const FULLWIDTH_COLON = '：'

/** `- 名称：值` one line per body row — the shape this app's users expect. */
export function toList(cells: Cells): string {
  if (cells.length === 0) return ''
  const headers = cells[0]
  return cells
    .slice(1)
    .map((row) =>
      headers
        .map((h, c) => `- ${h}${FULLWIDTH_COLON}${row[c] ?? ''}`)
        .join('\n')
    )
    .join('\n\n')
}

export function fromList(lines: string, headers?: string[]): Cells {
  const entries: [string, string][] = []
  for (const line of lines.split(/\r\n|\r|\n/)) {
    const m = LIST_RE.exec(line)
    if (!m) continue
    const body = m[1].trim()
    if (body === '') continue
    const i = body.indexOf(FULLWIDTH_COLON)
    if (i < 0) {
      entries.push(['', body])
      continue
    }
    entries.push([body.slice(0, i).trim(), body.slice(i + 1).trim()])
  }

  const cols = headers ? headers.slice() : []
  if (!headers) {
    for (const [key] of entries) if (key !== '' && !cols.includes(key)) cols.push(key)
  }
  if (cols.length === 0) return []

  // A repeated first field starts a new record — `- 名称：…` twice over.
  const first = cols[0]
  const rows: string[][] = [cols]
  let current: string[] | null = null
  for (const [key, value] of entries) {
    if (first !== '' && key === first) {
      current = EMPTY_ROW(cols.length)
      rows.push(current)
    } else if (!current) {
      current = EMPTY_ROW(cols.length)
      rows.push(current)
    }
    const c = cols.indexOf(key)
    if (c >= 0) current[c] = value
  }
  return rows
}

/* ---- formatting --------------------------------------------------------- */

const STAT_LABEL: Record<StatsKind, string> = {
  sum: '合计',
  avg: '平均',
  count: '计数',
  min: '最小',
  max: '最大'
}

/**
 * True for a row this function previously appended. `appendStatsRow` only
 * labels its row when there is a second column to put the value in, so a
 * one-column table cannot be recognised and keeps the old folding behaviour.
 * A data row that happens to be labelled `合计` is indistinguishable from a
 * summary row and will be skipped too — the accepted cost of not asking the
 * user to confirm.
 */
function isStatsRow(row: string[], cols: number): boolean {
  if (cols < 2) return false
  return Object.values(STAT_LABEL).includes((row[0] ?? '').trim())
}

/**
 * Append a summary row for one column.
 *
 * Every row is scanned — the header row is included, so a table with no header
 * still works; its text just never parses as a number. `count` counts the
 * values that also feed `sum`/`avg` (numeric cells), not non-empty cells, so
 * the five kinds agree on what a value is.
 *
 * A stats row already in the table is left out of the scan, so running the
 * same statistic twice reports the data rather than its own previous answer.
 * The rows below it stay: statistics are appended, never reordered to the end.
 */
export function appendStatsRow(cells: Cells, col: number, kind: StatsKind): Cells {
  const cols = colCount(cells)
  if (cols === 0) return cells.slice()
  const values: number[] = []
  for (const row of cells) {
    if (isStatsRow(row, cols)) continue
    const n = toNumber(row[col] ?? '')
    if (n !== null) values.push(n)
  }
  const sum = values.reduce((a, b) => a + b, 0)
  const result =
    kind === 'count'
      ? String(values.length)
      : values.length === 0
        ? ''
        : kind === 'sum'
          ? String(sum)
          : kind === 'avg'
            ? String(sum / values.length)
            : kind === 'min'
              ? String(Math.min(...values))
              : String(Math.max(...values))

  const row = EMPTY_ROW(cols)
  if (cols > 1) {
    row[0] = STAT_LABEL[kind]
    row[1] = result
  } else {
    row[0] = result
  }
  return [...cells, row]
}

/**
 * Re-align the source. `padTable` returns markdown; the widths come from
 * `suggestColumnWidths` so a CJK cell counts as two columns wide.
 */
export function padTable(cells: Cells, aligns: Align[]): string {
  return serializeTable(cells, aligns, { pad: true })
}
