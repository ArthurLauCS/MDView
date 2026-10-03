import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { renderMarkdown } from '../markdown/render'
import { resolveDocumentAssets } from '../markdown/resolve-assets'
import { cellRange, escapePipes, findTableAt, parseTable, serializeTable, type TableContext } from '../table/model'

const highlightDelimiter = { resolve: 'Highlight', mark: 'HighlightMark' }

export function liveMarkdown() {
  return markdown({ base: markdownLanguage, addKeymap: false, extensions: [{
    defineNodes: ['Highlight', 'HighlightMark'],
    parseInline: [{ name: 'Highlight', parse(cx, next, pos) {
      if (next !== 61 || cx.char(pos + 1) !== 61) return -1
      return cx.addDelimiter(highlightDelimiter, pos, pos + 2,
        !/\s/.test(cx.slice(pos + 2, pos + 3)), !/\s/.test(cx.slice(pos - 1, pos)))
    } }]
  }] })
}

class TaskCheckbox extends WidgetType {
  constructor(readonly from: number, readonly checked: boolean, readonly readOnly: boolean) { super() }
  eq(other: TaskCheckbox): boolean {
    return this.from === other.from && this.checked === other.checked && this.readOnly === other.readOnly
  }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.disabled = this.readOnly
    input.setAttribute('aria-label', '完成任务')
    input.onchange = () => view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: input.checked ? 'x' : ' ' }, userEvent: 'input' })
    return input
  }
}

class Rendered extends WidgetType {
  constructor(readonly html: string) { super() }
  eq(other: Rendered): boolean { return this.html === other.html }
  toDOM(): HTMLElement {
    const dom = document.createElement('span')
    dom.className = 'live-rendered'
    dom.innerHTML = this.html
    for (const image of dom.querySelectorAll('img')) {
      image.tabIndex = 0
      image.title = '点击选中图片，按 Z 全屏查看，Esc 返回'
      image.onmousedown = event => {
        event.preventDefault()
        event.stopPropagation()
        image.focus()
      }
    }
    return dom
  }
  ignoreEvent(): boolean { return false }
}

const tables = new WeakMap<HTMLElement, LiveTable>()

function cellHtml(raw: string, docDir: string | null): string {
  const dom = document.createElement('div')
  dom.innerHTML = resolveDocumentAssets(renderMarkdown(raw), docDir)
  return dom.firstElementChild?.tagName === 'P' ? dom.firstElementChild.innerHTML : dom.innerHTML
}

/** Keep a cell's input alive through transactions, including IME composition. */
class LiveTable extends WidgetType {
  constructor(readonly ctx: TableContext, readonly docDir: string | null, readonly readOnly: boolean) {
    super()
  }
  eq(other: LiveTable): boolean {
    return this.ctx.raw === other.ctx.raw && this.ctx.start === other.ctx.start && this.readOnly === other.readOnly
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'live-table'
    this.paint(dom)
    dom.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement
      if (target.matches('.live-cell-input')) return
      const cell = target.closest<HTMLElement>('[data-cell-from]')
      if (!cell || view.state.readOnly || event.button !== 0) return
      // Measure the editable text with the browser, including font metrics
      // and column alignment, instead of guessing a character width.
      const text = document.createElement('span')
      text.className = 'live-cell-input'
      text.style.whiteSpace = 'pre'
      text.textContent = cell.dataset.raw ?? ''
      cell.replaceChildren(text)
      const caret = document.caretRangeFromPoint(event.clientX, event.clientY)
      const at = caret?.startContainer === text.firstChild ? caret.startOffset : text.textContent.length
      event.preventDefault()
      editCell(view, cell, at)
    })
    dom.addEventListener('click', (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-cell-from]')
      if (cell && !cell.querySelector('input') && !view.state.readOnly) editCell(view, cell)
    })
    dom.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement
      if (!input.matches('.live-cell-input') || view.state.readOnly) return
      const cell = input.parentElement!
      const current = tables.get(dom)!
      const position = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
      const range = cellRange(current.ctx, position)
      const insert = escapePipes(input.value).replace(/\r?\n/g, '<br>')
      if (range.missing) {
        const cells = parseTable(current.ctx)
        cells[position.row][position.col] = insert
        const raw = serializeTable(cells, current.ctx.aligns)
        const next = { ...current.ctx, raw, end: current.ctx.start + raw.length }
        view.dispatch({ changes: { from: current.ctx.start, to: current.ctx.end, insert: raw }, selection: { anchor: cellRange(next, position).to }, userEvent: 'input.type' })
        return
      }
      const cursor = range.from + Math.min(input.selectionStart ?? insert.length, insert.length)
      view.dispatch({ changes: { ...range, insert }, selection: { anchor: cursor }, userEvent: 'input.type' })
    })
    dom.addEventListener('focusout', () => {
      // Wait for a toolbar click to capture the current table context first.
      requestAnimationFrame(() => {
        if (!dom.contains(document.activeElement)) tables.get(dom)?.paint(dom)
      })
    })
    return dom
  }
  paint(dom: HTMLElement): void {
    tables.set(dom, this)
    dom.innerHTML = resolveDocumentAssets(renderMarkdown(this.ctx.raw), this.docDir)
    const rows = parseTable(this.ctx)
    dom.querySelectorAll('tr').forEach((tr, row) => {
      tr.querySelectorAll<HTMLElement>('th, td').forEach((cell, col) => {
        const range = cellRange(this.ctx, { row, col })
        cell.dataset.row = String(row)
        cell.dataset.col = String(col)
        cell.dataset.cellFrom = String(range.from)
        cell.dataset.cellTo = String(range.to)
        cell.dataset.raw = rows[row][col]
        cell.tabIndex = this.readOnly ? -1 : 0
        cell.setAttribute('aria-label', `第 ${row + 1} 行，第 ${col + 1} 列`)
        cell.onfocus = () => {
          if (!this.readOnly && !cell.querySelector('input')) editCell(EditorView.findFromDOM(dom)!, cell)
        }
      })
    })
  }
  updateDOM(dom: HTMLElement): boolean {
    const previous = tables.get(dom)!
    const input = dom.querySelector<HTMLInputElement>('.live-cell-input')
    const sameShape = previous.ctx.cols === this.ctx.cols && previous.ctx.bodyRows === this.ctx.bodyRows
    tables.set(dom, this)
    if (input && document.activeElement === input && sameShape && !this.readOnly) {
      dom.querySelectorAll<HTMLElement>('[data-cell-from]').forEach((cell) => {
        const range = cellRange(this.ctx, { row: Number(cell.dataset.row), col: Number(cell.dataset.col) })
        const raw = this.ctx.raw.slice(range.from - this.ctx.start, range.to - this.ctx.start)
        if (!cell.contains(input) && cell.dataset.raw !== raw) cell.innerHTML = cellHtml(raw, this.docDir)
        cell.dataset.cellFrom = String(range.from)
        cell.dataset.cellTo = String(range.to)
        cell.dataset.raw = raw
        if (cell.contains(input) && input.value !== cell.dataset.raw) input.value = cell.dataset.raw
      })
    } else {
      this.paint(dom)
    }
    return true
  }
  ignoreEvent(): boolean { return true }
}

function editCell(view: EditorView, cell: HTMLElement, start?: number, end = start): void {
  const table = cell.closest<HTMLElement>('.live-table')!
  for (const other of table.querySelectorAll<HTMLInputElement>('.live-cell-input')) {
    if (other.parentElement !== cell) {
      const previous = other.parentElement!
      previous.innerHTML = cellHtml(previous.dataset.raw ?? '', tables.get(table)!.docDir)
    }
  }
  let input = cell.querySelector<HTMLInputElement>('input')
  if (!input) {
    input = document.createElement('input')
    input.className = 'live-cell-input'
    input.value = cell.dataset.raw ?? ''
    input.setAttribute('aria-label', cell.getAttribute('aria-label')!)
    cell.replaceChildren(input)
    const sync = (): void => {
      if (!input!.isConnected) return
      const from = Number(cell.dataset.cellFrom)
      view.dispatch({ selection: { anchor: from + (input!.selectionStart ?? 0), head: from + (input!.selectionEnd ?? 0) } })
    }
    input.addEventListener('select', sync)
    input.addEventListener('keyup', sync)
    input.addEventListener('click', sync)
  }
  input.focus()
  input.setSelectionRange(start ?? input.value.length, end ?? input.value.length)
  const from = Number(cell.dataset.cellFrom)
  view.dispatch({ selection: { anchor: from + (input.selectionStart ?? 0), head: from + (input.selectionEnd ?? 0) } })
}

export function focusTableCell(view: EditorView, start: number, end: number): boolean {
  if (view.state.readOnly) return false
  const cell = [...view.dom.querySelectorAll<HTMLElement>('[data-cell-from]')].find(
    (el) => start >= Number(el.dataset.cellFrom) && end <= Number(el.dataset.cellTo)
  )
  if (!cell) return false
  editCell(view, cell, start - Number(cell.dataset.cellFrom), end - Number(cell.dataset.cellFrom))
  return true
}

export function previewDecorations(state: EditorState, docDir: string | null): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const source = state.doc.toString()
  const hide = (from: number, to: number): void => {
    if (to > from) ranges.push(Decoration.replace({}).range(from, to))
  }
  const mark = (from: number, to: number, className: string): void => {
    ranges.push(Decoration.mark({ class: className }).range(from, to))
  }
  const line = (at: number, className: string): void => {
    ranges.push(Decoration.line({ class: className }).range(state.doc.lineAt(at).from))
  }
  syntaxTree(state).iterate({
    enter(node) {
      const { name, from, to } = node
      const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name)
      if (heading) line(from, `live-heading live-h${heading[1]}`)
      if (name === 'HeaderMark') {
        const end = source[to] === ' ' ? to + 1 : to
        hide(from, end)
      }
      if (name === 'StrongEmphasis') mark(from, to, 'live-strong')
      if (name === 'Emphasis') mark(from, to, 'live-em')
      if (name === 'Strikethrough') mark(from, to, 'live-strike')
      if (name === 'InlineCode') mark(from, to, 'live-code')
      if (name === 'Highlight') mark(from, to, 'live-mark')
      if (name === 'Superscript') mark(from, to, 'live-sup')
      if (name === 'Subscript') mark(from, to, 'live-sub')
      if (['EmphasisMark', 'StrikethroughMark', 'CodeMark', 'HighlightMark', 'SuperscriptMark', 'SubscriptMark'].includes(name)) hide(from, to)
      if (name === 'TaskMarker') {
        ranges.push(Decoration.replace({ widget: new TaskCheckbox(from, /x/i.test(source.slice(from, to)), state.readOnly) }).range(from, to))
        return false
      }
      if (name === 'HTMLTag' && source.slice(from, to) === '<u>') {
        const end = source.indexOf('</u>', to)
        if (end >= 0 && end < state.doc.lineAt(from).to) {
          hide(from, to)
          mark(to, end, 'live-underline')
          hide(end, end + 4)
        }
      }
      if (name === 'QuoteMark') {
        line(from, 'live-quote')
        hide(from, source[to] === ' ' ? to + 1 : to)
      }
      if (name === 'ListMark') {
        line(from, 'live-list')
        if (/[-+*]/.test(source.slice(from, to))) {
          ranges.push(Decoration.replace({ widget: new Rendered('<span class="live-bullet">•</span>') }).range(from, to))
        }
      }
      if (name === 'Link') {
        mark(from, to, 'live-link')
        // The label stays editable; reveal the destination only while editing it.
        const end = node.node.getChildren('LinkMark')[1]
        if (end) {
          hide(from, from + 1)
          if (state.selection.main.head <= end.from || state.selection.main.head >= to) hide(end.from, to)
        }
        return false
      }
      if (name === 'Image') {
        const selected = state.selection.ranges.some((r) => r.from < to && r.to > from)
        const inside = state.selection.main.head > from && state.selection.main.head < to
        if (!selected && !inside) {
          const html = resolveDocumentAssets(renderMarkdown(source.slice(from, to)), docDir)
          ranges.push(Decoration.replace({ widget: new Rendered(html) }).range(from, to))
        }
        return false
      }
      if (name === 'HorizontalRule') {
        ranges.push(Decoration.replace({ widget: new Rendered('<hr>') }).range(from, to))
        return false
      }
      if (name === 'FencedCode' || name === 'CodeBlock') {
        for (let pos = from; pos <= to;) {
          const row = state.doc.lineAt(pos)
          line(pos, 'live-code-line')
          pos = row.to + 1
        }
      }
      if (name === 'CodeInfo' || name === 'CodeMark') mark(from, to, 'live-code-info')
      if (name === 'Table') {
        const ctx = findTableAt(source, from)
        if (ctx) ranges.push(Decoration.replace({ widget: new LiveTable(ctx, docDir, state.readOnly), block: true }).range(ctx.start, ctx.end))
        return false
      }
    }
  })
  return Decoration.set(ranges, true)
}

// Highlight the editable text with the existing renderer's tokens. These
// marks never replace code, so clicking and dragging keep native coordinates.
function codeHighlights(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  syntaxTree(state).iterate({ enter(node) {
    if (node.name !== 'FencedCode') return
    const code = node.node.getChild('CodeText')
    if (!code) return false
    const dom = document.createElement('div')
    dom.innerHTML = renderMarkdown(state.doc.sliceString(node.from, node.to))
    const rendered = dom.querySelector('.codeblock__pre > code')
    // Blockquotes and list prefixes can make the rendered offsets differ.
    if (!rendered || rendered.textContent?.trimEnd() !== state.doc.sliceString(code.from, code.to).trimEnd()) return false
    let pos = code.from
    const walk = (parent: Node): void => {
      for (const child of parent.childNodes) {
        const from = pos
        if (child.nodeType === Node.TEXT_NODE) pos += child.textContent!.length
        else {
          walk(child)
          const className = (child as HTMLElement).className
          if (className && pos > from) ranges.push(Decoration.mark({ class: className }).range(from, Math.min(pos, code.to)))
        }
      }
    }
    walk(rendered)
    return false
  } })
  return Decoration.set(ranges, true)
}

export function livePreview(docDir: string | null) {
  return [StateField.define<DecorationSet>({
    create: (state) => previewDecorations(state, docDir),
    update: (value, tr) => tr.docChanged || tr.selection || tr.reconfigured || syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? previewDecorations(tr.state, docDir) : value,
    provide: (field) => EditorView.decorations.from(field)
  }), ViewPlugin.define((view) => ({
    decorations: codeHighlights(view.state),
    update(update) {
      if (update.docChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) this.decorations = codeHighlights(update.state)
    }
  }), { decorations: (plugin) => plugin.decorations })]
}
