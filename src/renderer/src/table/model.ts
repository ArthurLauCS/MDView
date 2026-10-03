/**
 * Pure markdown table model: locates a table in a source string, parses it into
 * a rectangular cell matrix and serializes it back. No DOM, no editor deps.
 *
 * Line endings are normalized to `\n` on parse. A `\r\n` source therefore
 * serializes back as `\n` — byte-identical round-tripping is only guaranteed
 * for sources that already use `\n`.
 */

export interface CellPos {
  row: number
  col: number
}

export interface TableContext {
  /** Character offset of the first char of the table block in the source. */
  start: number
  /** Character offset just past the last char of the table block. */
  end: number
  /** Raw source slice [start, end). */
  raw: string
  /** Number of columns. */
  cols: number
  /** Number of body rows (excludes the header row and the delimiter row). */
  bodyRows: number
  /** Column alignments as written in the delimiter row. */
  aligns: ('left' | 'center' | 'right' | 'none')[]
}

export type Align = TableContext['aligns'][number]

interface Line {
  text: string
  start: number
}

/** Cell boundary within a line, with offsets into the *raw* slice. */
/** Offsets are relative to the line they came from, not to `raw`. */
interface CellSpan {
  start: number
  end: number
}

interface Block {
  lines: Line[]
  aligns: Align[]
  start: number
  end: number
}

const DELIM = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/
const FENCE = /^\s*(?:```|~~~)/
const BLOCK_START = /^\s{0,3}(?:#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/

function splitLines(src: string): Line[] {
  const lines: Line[] = []
  let start = 0
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === 10) {
      let text = src.slice(start, i)
      if (text.endsWith('\r')) text = text.slice(0, -1)
      lines.push({ text, start })
      start = i + 1
    }
  }
  const tail = src.slice(start)
  if (tail !== '') lines.push({ text: tail, start })
  return lines
}

/**
 * Cell boundaries of a row. A `|` inside a code span or escaped as `\|` does
 * not split; a single trailing pipe is the closer, not an empty cell.
 */
function splitRow(text: string): CellSpan[] {
  const boundaries: number[] = []
  let i = 0
  let inCode = false
  let tickLen = 0

  if (text.startsWith('|')) i = 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && text[i + 1] === '|') {
      i += 2
      continue
    }
    if (ch === '`') {
      let n = 1
      while (text[i + n] === '`') n++
      if (!inCode) {
        inCode = true
        tickLen = n
      } else if (n === tickLen) {
        inCode = false
      }
      i += n
      continue
    }
    if (ch === '|' && !inCode) {
      boundaries.push(i)
      i++
      continue
    }
    i++
  }

  const spans: CellSpan[] = []
  const push = (from: number, to: number): void => {
    let s = from
    let e = to
    while (s < e && (text[s] === ' ' || text[s] === '\t')) s++
    while (e > s && (text[e - 1] === ' ' || text[e - 1] === '\t')) e--
    spans.push({ start: s, end: e })
  }

  // A trailing pipe closes the row rather than opening an empty last cell.
  const more = text.endsWith('|') && boundaries.length > 0
  const cuts = more ? boundaries.slice(0, -1) : boundaries
  const last = more ? boundaries[boundaries.length - 1] : text.length

  let pos = text.startsWith('|') ? 1 : 0
  for (const b of cuts) {
    push(pos, b)
    pos = b + 1
  }
  push(pos, last)
  return spans
}

/** A pipe outside code spans and not escaped — the only thing that splits. */
function lineHasPipe(text: string): boolean {
  let inCode = false
  let tickLen = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && text[i + 1] === '|') {
      i += 2
      continue
    }
    if (ch === '`') {
      let n = 1
      while (text[i + n] === '`') n++
      if (!inCode) {
        inCode = true
        tickLen = n
      } else if (n === tickLen) {
        inCode = false
      }
      i += n
      continue
    }
    if (ch === '|' && !inCode) return true
    i++
  }
  return false
}

function delimiterAligns(text: string): Align[] | null {
  if (!DELIM.test(text) || !text.includes('-')) return null
  return splitRow(text).map((span) => {
    const t = text.slice(span.start, span.end)
    const left = t.startsWith(':')
    const right = t.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return 'none'
  })
}

/** Validate the header/delimiter grammar at `i`, then extend over body rows. */
function tryCollect(lines: Line[], i: number): Block | null {
  const header = lines[i]
  const delim = lines[i + 1]
  if (!delim) return null
  if (!lineHasPipe(header.text)) return null
  const aligns = delimiterAligns(delim.text)
  if (!aligns) return null

  const n = aligns.length
  const rows = [header, delim]
  for (let j = i + 2; j < lines.length; j++) {
    const t = lines[j].text
    if (t.trim() === '') break
    if (FENCE.test(t) || BLOCK_START.test(t)) break
    // A lone paragraph line under a one-column table is a body row.
    if (n !== 1 && !lineHasPipe(t)) break
    rows.push(lines[j])
  }

  const last = rows[rows.length - 1]
  return { lines: rows, aligns, start: rows[0].start, end: last.start + last.text.length }
}

/**
 * Index of the line containing `offset`. The line end is exclusive so that an
 * offset sitting on a newline belongs to the line it terminates, not the next
 * one — the cursor lands there whenever a row is edited at its edge.
 */
function lineAt(lines: Line[], offset: number): number {
  const last = lines.length - 1
  for (let i = 0; i < last; i++) {
    if (offset < lines[i].start + lines[i].text.length) return i
  }
  return last
}

function toContext(block: Block, src: string): TableContext {
  const cols = splitRow(block.lines[0].text).length
  const ctx: TableContext = {
    start: block.start,
    end: block.end,
    raw: '',
    cols,
    bodyRows: block.lines.length - 2,
    aligns: block.aligns.slice(0, cols)
  }
  while (ctx.aligns.length < cols) ctx.aligns.push('none')
  ctx.raw = src.slice(block.start, block.end)
  return ctx
}

export function findTableAt(src: string, offset: number): TableContext | null {
  const lines = splitLines(src)
  if (lines.length === 0) return null
  const li = lineAt(lines, offset)
  for (let i = li; i >= Math.max(0, li - 3); i--) {
    const block = tryCollect(lines, i)
    if (!block) continue
    // A cursor on the newline just past the table is already outside it.
    if (offset >= block.start && offset <= block.end) return toContext(block, src)
  }
  return null
}

/**
 * Rows of the table with the delimiter row removed, row 0 = header.
 *
 * The matrix is the logical table, not the source: the delimiter row carries
 * no data and is regenerated from `aligns` on serialize. Including it here
 * would corrupt every row operation, since a sort or a move would drag it out
 * of position 1.
 */
export function parseTable(ctx: TableContext): string[][] {
  const lines = splitLines(ctx.raw)
  const out = lines
    .filter((_, i) => i !== 1)
    .map((line) =>
      // `splitRow` returns offsets within the line, so they must be rebased
      // onto the raw slice or every row after the first reads the header's.
      splitRow(line.text).map((s) => ctx.raw.slice(line.start + s.start, line.start + s.end))
    )
  for (const row of out) {
    while (row.length < ctx.cols) row.push('')
    row.length = ctx.cols
  }
  return out
}

/**
 * Map a document offset to a matrix position. Row 0 is the header, matching
 * `parseTable`; the delimiter row is skipped rather than offset around, so
 * callers never have to know it exists.
 *
 * Returns null when the offset is not inside a cell — an empty line under the
 * table, or the delimiter row itself.
 */
export function cellAt(ctx: TableContext, offset: number): CellPos | null {
  const local = offset - ctx.start
  if (local < 0 || local > ctx.raw.length) return null

  const lines = splitLines(ctx.raw)
  const rawLine = lines.findIndex((l) => local >= l.start && local <= l.start + l.text.length)
  if (rawLine < 0) return null
  // Source line 1 is the delimiter row; the matrix never sees it.
  if (rawLine === 1) return null
  const row = rawLine === 0 ? 0 : rawLine - 1

  const line = lines[rawLine]
  // `splitRow` offsets are relative to the line, so the caret has to be too.
  const inset = local - line.start
  const spans = splitRow(line.text)
  let col = spans.findIndex((s) => inset >= s.start && inset <= s.end)
  // A caret on a separator belongs to the cell it just left, which is what
  // typing at the end of a cell should extend.
  if (col < 0) col = Math.max(0, spans.length - 1)

  if (col < 0 || col >= ctx.cols) return null
  return { row, col }
}

/** Display width: CJK and fullwidth forms occupy two columns. */
export function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) w += isWide(ch) ? 2 : 1
  return w
}

const WIDE = /[ᄀ-ᅟ⺀-꓏ꥠ-꥿가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/
function isWide(ch: string): boolean {
  return WIDE.test(ch)
}

/** A raw pipe in cell text must be escaped or it splits the cell. */
export function escapePipes(s: string): string {
  return s.replace(/(?<!\\)\|/g, '\\|')
}

export function unescapePipes(s: string): string {
  return s.replace(/\\\|/g, '|')
}

function inlineCell(s: string): string {
  return s.replace(/\r\n|\r|\n/g, '<br>')
}

/**
 * The delimiter row sets the column width, so it is a run of dashes padded to
 * the same display width as the cells. Column widths are floored per alignment
 * because `:--:` needs two dashes and `--:` needs one.
 */
function alignDelim(width: number, align: Align): string {
  if (align === 'center') return ':' + '-'.repeat(Math.max(1, width - 2)) + ':'
  if (align === 'right') return '-'.repeat(Math.max(1, width - 1)) + ':'
  if (align === 'left') return ':' + '-'.repeat(Math.max(1, width - 1))
  return '-'.repeat(width)
}

/** Widest of the alignment markers, so every column gets the same floor. */
function alignFloor(_align: Align): number {
  return 3
}

/** Width of a column in display columns, honouring alignment floors. */
function columnWidths(cells: string[][], aligns: Align[]): number[] {
  const cols = cells.reduce((m, r) => Math.max(m, r.length), 0)
  const widths: number[] = []
  for (let c = 0; c < cols; c++) {
    let w = Math.max(3, alignFloor(aligns[c] ?? 'none'))
    for (const row of cells) w = Math.max(w, displayWidth(row[c] ?? ''))
    widths.push(Math.min(w, 40))
  }
  return widths
}

export function suggestColumnWidths(cells: string[][]): number[] {
  const cols = cells.reduce((m, r) => Math.max(m, r.length), 0)
  const widths: number[] = []
  for (let c = 0; c < cols; c++) {
    let w = 3
    for (const row of cells) w = Math.max(w, displayWidth(row[c] ?? ''))
    widths.push(Math.min(w, 40))
  }
  return widths
}

export function serializeTable(
  cells: string[][],
  aligns: Align[],
  opts?: { pad?: boolean }
): string {
  if (cells.length === 0) return ''
  // The header row fixes the width: a row with more cells than the header is
  // truncated, one with fewer is padded.
  const cols = cells[0].length
  if (cols === 0) return ''
  const widths = opts?.pad === true ? columnWidths(cells, aligns) : null

  const norm = (row: string[]): string[] => {
    const out = row.slice(0, cols)
    while (out.length < cols) out.push('')
    return out
  }
  const render = (row: string[]): string =>
    '| ' +
    norm(row)
      .map((v, c) => {
        const text = inlineCell(v)
        if (!widths) return text
        // Widths are terminal columns, not code units: a CJK cell is two
        // columns per character, so pad to the difference.
        const extra = displayWidth(text) - text.length
        return text.padEnd(Math.max(1, widths[c] - extra))
      })
      .join(' | ') +
    ' |'

  const lines = [
    render(cells[0]),
    '| ' +
      Array.from({ length: cols }, (_, c) =>
        alignDelim(widths ? widths[c] : 3, aligns[c] ?? 'none')
      ).join(' | ') +
      ' |'
  ]
  for (let r = 1; r < cells.length; r++) lines.push(render(cells[r]))
  return lines.join('\n')
}

export interface TableEdit {
  text: string
  cursor: number
}

/** Raw source line index for a matrix row: the delimiter row is line 1. */
function rawLineFor(row: number): number {
  return row >= 1 ? row + 1 : row
}

/** Keep the same line/cell/inset across an edit, falling back sensibly. */
function mapCursor(oldText: string, nextText: string, cursor: number): number {
  if (cursor < 0) cursor = 0
  if (cursor > oldText.length) cursor = oldText.length
  const lines = splitLines(oldText)
  if (lines.length === 0) return 0
  const row = lineAt(lines, cursor)
  const offsets = cursor - lines[row].start
  const spans = splitRow(lines[row].text)
  // Only the last span may be empty (a trailing cell); matching an empty span
  // would let it swallow the cursor from a real cell before it.
  let col = spans.length - 1
  for (let i = 0; i < spans.length - 1; i++) {
    if (offsets >= spans[i].start && offsets <= spans[i].end) {
      col = i
      break
    }
  }
  const from = spans[col]

  const nextLines = splitLines(nextText)
  if (nextLines.length === 0) return 0
  const line = nextLines[Math.min(rawLineFor(row), nextLines.length - 1)]
  const next = splitRow(line.text)
  const span = next[Math.min(col, next.length - 1)]
  const inset = Math.min(Math.max(offsets - from.start, 0), span.end - span.start)
  return line.start + span.start + inset
}

export function replaceTable(
  src: string,
  ctx: TableContext,
  cells: string[][],
  aligns: Align[],
  opts?: { pad?: boolean; cursor?: number }
): TableEdit {
  const next = serializeTable(cells, aligns, opts)
  const text = src.slice(0, ctx.start) + next + src.slice(ctx.end)
  const at = opts?.cursor ?? ctx.start
  return {
    text,
    cursor: mapCursor(ctx.raw, next, at - ctx.start) + ctx.start
  }
}
