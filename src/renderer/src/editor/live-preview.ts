import { t } from '../i18n'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { searchPanelOpen } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import hljs from 'highlight.js/lib/common'
import { detectLanguage } from '@shared/markdown/detect'
import { frontmatterEnd } from '@shared/markdown/frontmatter'
import { markdownReferences, type MarkdownReferences } from '@shared/markdown/pipeline'
import { renderMarkdown } from '../markdown/render'
import { resolveDocumentAssets } from '../markdown/resolve-assets'
import { linkResolver } from '../markdown/links'
import { settingsSnapshot } from '../state/settings'
import { cellRange, escapePipes, findTableAt, parseTable, serializeTable, type TableContext } from '../table/model'

const highlightDelimiter = { resolve: 'Highlight', mark: 'HighlightMark' }

export function startCodeBlock(view: EditorView): boolean {
  const { state } = view
  const cursor = state.selection.main
  if (state.readOnly || !cursor.empty) return false
  const row = state.doc.lineAt(cursor.head)
  const fence = /^( {0,3})(`{3,}|~{3,})[\w+-]*\s*$/.exec(row.text)
  const node = syntaxTree(state).resolveInner(row.from + row.text.length, -1)
  let block = node
  while (block.parent && block.name !== 'FencedCode') block = block.parent
  if (!fence || cursor.head !== row.to || block.name !== 'FencedCode' || block.from !== row.from + fence[1].length) return false
  if (block.getChildren('CodeMark').length > 1) return false
  view.dispatch({ changes: { from: row.to, insert: `\n${fence[1]}\n${fence[1]}${fence[2]}` }, selection: { anchor: row.to + 1 + fence[1].length }, userEvent: 'input.type' })
  return true
}

export function leaveCodeBlock(view: EditorView, end: number): void {
  if (view.state.readOnly) return
  const doc = view.state.doc
  const next = end < doc.length ? doc.lineAt(end + 1) : null
  const at = next?.from ?? end
  const insert = next ? (next.length ? '\n' : '') : '\n\n'
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: next ? at : at + insert.length }, scrollIntoView: true, userEvent: 'input' })
  view.focus()
}

class CodeLanguage extends WidgetType {
  readonly language = settingsSnapshot().language
  constructor(readonly from: number, readonly infoFrom: number, readonly infoTo: number, readonly to: number,
    readonly lang: string, readonly detected: string | null, readonly readOnly: boolean) { super() }
  eq(other: CodeLanguage): boolean {
    return this.language === other.language && this.from === other.from && this.infoFrom === other.infoFrom && this.infoTo === other.infoTo && this.to === other.to &&
      this.lang === other.lang && this.detected === other.detected && this.readOnly === other.readOnly
  }
  toDOM(view: EditorView): HTMLElement {
    const select = document.createElement('select')
    select.className = 'live-code-language'
    select.setAttribute('aria-label', t('代码语言'))
    select.dataset.from = String(this.from)
    select.dataset.to = String(this.to)
    select.disabled = this.readOnly
    select.add(new Option(this.detected ? t('自动检测 · {0}', this.detected) : t('自动检测'), ''))
    select.add(new Option(t('纯文本'), 'text'))
    const languages = hljs.listLanguages()
    if (this.lang && this.lang !== 'text' && !languages.includes(this.lang)) languages.push(this.lang)
    for (const lang of languages.sort()) select.add(new Option(lang, lang))
    select.value = this.lang
    select.onchange = () => {
      view.dispatch({ changes: { from: this.infoFrom, to: this.infoTo, insert: select.value }, userEvent: 'input' })
      view.focus()
    }
    return select
  }
}

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
  readonly language = settingsSnapshot().language
  constructor(readonly from: number, readonly checked: boolean, readonly readOnly: boolean) { super() }
  eq(other: TaskCheckbox): boolean {
    return this.language === other.language && this.from === other.from && this.checked === other.checked && this.readOnly === other.readOnly
  }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.disabled = this.readOnly
    input.setAttribute('aria-label', t('完成任务'))
    input.onchange = () => view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: input.checked ? 'x' : ' ' }, userEvent: 'input' })
    return input
  }
}

class Rendered extends WidgetType {
  readonly language = settingsSnapshot().language
  constructor(readonly html: string) { super() }
  eq(other: Rendered): boolean { return this.language === other.language && this.html === other.html }
  toDOM(): HTMLElement {
    const dom = document.createElement('span')
    dom.className = 'live-rendered'
    dom.innerHTML = this.html
    for (const image of dom.querySelectorAll('img')) {
      image.tabIndex = 0
      image.title = t('点击选中图片，按 Z 全屏查看，Esc 返回')
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

function cellHtml(raw: string, docDir: string | null, references: MarkdownReferences): string {
  const dom = document.createElement('div')
  dom.innerHTML = resolveDocumentAssets(renderMarkdown(raw, references), docDir)
  return dom.firstElementChild?.tagName === 'P' ? dom.firstElementChild.innerHTML : dom.innerHTML
}

/** Keep a cell's input alive through transactions, including IME composition. */
class LiveTable extends WidgetType {
  readonly language = settingsSnapshot().language
  constructor(readonly ctx: TableContext, readonly docDir: string | null, readonly readOnly: boolean,
    readonly references: MarkdownReferences, readonly referenceKey: string) {
    super()
  }
  eq(other: LiveTable): boolean {
    return this.referenceKey === other.referenceKey && this.language === other.language && this.docDir === other.docDir && this.ctx.raw === other.ctx.raw && this.ctx.start === other.ctx.start && this.readOnly === other.readOnly
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
    dom.innerHTML = resolveDocumentAssets(renderMarkdown(this.ctx.raw, this.references), this.docDir)
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
        cell.setAttribute('aria-label', t('第 {0} 行，第 {1} 列', row + 1, col + 1))
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
        if (!cell.contains(input) && (cell.dataset.raw !== raw || previous.referenceKey !== this.referenceKey)) cell.innerHTML = cellHtml(raw, this.docDir, this.references)
        cell.dataset.cellFrom = String(range.from)
        cell.dataset.cellTo = String(range.to)
        cell.dataset.raw = raw
        cell.setAttribute('aria-label', t('第 {0} 行，第 {1} 列', Number(cell.dataset.row) + 1, Number(cell.dataset.col) + 1))
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
      previous.innerHTML = cellHtml(previous.dataset.raw ?? '', tables.get(table)!.docDir, tables.get(table)!.references)
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
  // Search must expose matches in table cells, image paths and hidden Markdown markers.
  if (searchPanelOpen(state)) return Decoration.none
  const ranges: Range<Decoration>[] = []
  const source = state.doc.toString()
  const references = markdownReferences(source)
  const referenceKey = JSON.stringify(references)
  const resolveLink = linkResolver(source, references)
  const hide = (from: number, to: number): void => {
    if (to > from) ranges.push(Decoration.replace({}).range(from, to))
  }
  const mark = (from: number, to: number, className: string): void => {
    ranges.push(Decoration.mark({ class: className }).range(from, to))
  }
  const line = (at: number, className: string): void => {
    ranges.push(Decoration.line({ class: className }).range(state.doc.lineAt(at).from))
  }
  const body = frontmatterEnd(source)
  for (let pos = 0; pos < body; pos = state.doc.lineAt(pos).to + 1) line(pos, 'live-frontmatter')
  syntaxTree(state).iterate({
    enter(node) {
      const { name, from, to } = node
      if (from < body && name !== 'Document') return false
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
      if (name === 'Link' || name === 'Autolink' || (name === 'URL' && !['Link', 'Autolink', 'Image', 'LinkReference'].includes(node.node.parent?.name ?? ''))) {
        const href = resolveLink(node.node)
        if (href === null) return false
        ranges.push(Decoration.mark({ class: 'live-link', attributes: { 'data-md-href': href, title: t('Ctrl+点击打开链接') } }).range(from, to))
        // The label stays editable; reveal the destination only while editing it.
        const end = node.node.getChildren('LinkMark')[1]
        if (end) {
          hide(from, from + 1)
          if (state.selection.main.head <= end.from || state.selection.main.head >= to) hide(end.from, to)
        }
        if (name !== 'Link') return false
      }
      if (name === 'Image') {
        const selected = state.selection.ranges.some((r) => r.from < to && r.to > from)
        const inside = state.selection.main.head > from && state.selection.main.head < to
        if (!selected && !inside) {
          const html = resolveDocumentAssets(renderMarkdown(source.slice(from, to), references), docDir)
          ranges.push(Decoration.replace({ widget: new Rendered(html) }).range(from, to))
        }
        return false
      }
      if (name === 'HorizontalRule') {
        ranges.push(Decoration.replace({ widget: new Rendered('<hr>') }).range(from, to))
        return false
      }
      if (name === 'FencedCode') {
        const first = state.doc.lineAt(from)
        const marks = node.node.getChildren('CodeMark')
        const closing = marks[1]
        const code = node.node.getChild('CodeText')
        const lang = node.node.getChild('CodeInfo')
        // Keep an unfinished opening fence visible until Enter creates a body.
        if (first.to >= to) return false
        const focused = state.selection.main.head >= from && state.selection.main.head <= to
        for (let pos = first.from; pos <= to;) {
          const row = state.doc.lineAt(pos)
          const header = pos === first.from
          const footer = !!closing && row.from === state.doc.lineAt(closing.from).from
          ranges.push(Decoration.line({
            class: `live-code-line${header ? ' live-code-header' : ''}${footer ? ' live-code-end' : ''}${focused && header ? ' is-active' : ''}`,
            attributes: { 'data-code-from': String(from), ...(footer ? { 'data-code-end': String(to) } : {}) }
          }).range(row.from))
          pos = row.to + 1
        }
        ranges.push(Decoration.replace({ widget: new CodeLanguage(from, marks[0].to, first.to, to,
          lang ? source.slice(lang.from, lang.to) : '', code ? detectLanguage(source.slice(code.from, code.to)).lang : null, state.readOnly)
        }).range(from, first.to))
        if (closing) hide(closing.from, closing.to)
        return false
      }
      if (name === 'CodeBlock') {
        for (let pos = from; pos <= to;) {
          const row = state.doc.lineAt(pos)
          line(pos, 'live-code-line')
          pos = row.to + 1
        }
      }
      if (name === 'Table') {
        const ctx = findTableAt(source, from)
        if (ctx) ranges.push(Decoration.replace({ widget: new LiveTable(ctx, docDir, state.readOnly, references, referenceKey), block: true }).range(ctx.start, ctx.end))
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
          const to = Math.min(pos, code.to)
          if (className && to > from) ranges.push(Decoration.mark({ class: className }).range(from, to))
        }
      }
    }
    walk(rendered)
    return false
  } })
  return Decoration.set(ranges, true)
}

export function livePreview(docDir: string | null) {
  return [EditorView.domEventHandlers({
    mouseover(event, view) {
      const line = (event.target as HTMLElement).closest<HTMLElement>('[data-code-from]')
      for (const header of view.dom.querySelectorAll<HTMLElement>('.live-code-header')) {
        header.classList.toggle('is-hovered', !!line && header.dataset.codeFrom === line.dataset.codeFrom)
      }
    },
    mouseleave(_event, view) {
      for (const header of view.dom.querySelectorAll('.live-code-header.is-hovered')) header.classList.remove('is-hovered')
    }
  }), StateField.define<DecorationSet>({
    create: (state) => previewDecorations(state, docDir),
    update: (value, tr) => tr.docChanged || tr.selection || tr.reconfigured || searchPanelOpen(tr.state) !== searchPanelOpen(tr.startState) || syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? previewDecorations(tr.state, docDir) : value,
    provide: (field) => EditorView.decorations.from(field)
  }), ViewPlugin.define((view) => ({
    decorations: codeHighlights(view.state),
    update(update) {
      if (update.docChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) this.decorations = codeHighlights(update.state)
    }
  }), { decorations: (plugin) => plugin.decorations })]
}
