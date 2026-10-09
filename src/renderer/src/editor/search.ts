import { EditorState, type SelectionRange } from '@codemirror/state'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, searchPanelOpen, setSearchQuery } from '@codemirror/search'
import { renderMarkdown } from '../markdown/render'

function navigate(view: EditorView, previous: boolean): void {
  if (!searchPanelOpen(view.state)) {
    const query = getSearchQuery(view.state)
    openSearchPanel(view)
    if (query.valid) view.dispatch({ effects: setSearchQuery.of(query) })
  }
  if (previous) findPrevious(view)
  else findNext(view)
}

export const searchCommands = {
  open: openSearchPanel,
  replace: (view: EditorView) => {
    openSearchPanel(view)
    view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')?.focus()
  },
  next: (view: EditorView) => navigate(view, false),
  previous: (view: EditorView) => navigate(view, true),
  close: closeSearchPanel
}

export type SearchCommand = keyof typeof searchCommands

// CodeMirror sees a table as one replacement widget, not the rows inside it.
function searchTarget(view: EditorView, range: SelectionRange) {
  if (!searchPanelOpen(view.state) || range.empty) return null
  const cell = [...view.dom.querySelectorAll<HTMLElement>('[data-cell-from].cm-searchMatch-selected')].find(
    el => range.from >= Number(el.dataset.cellFrom) && range.to <= Number(el.dataset.cellTo)
  )
  const viewport = view.scrollDOM.getBoundingClientRect()
  const vertical = (target: { top: number, bottom: number }) => target.top < viewport.top || target.bottom > viewport.bottom
    ? target.top - viewport.top - (viewport.height - (target.bottom - target.top)) / 2 : 0
  if (!cell) {
    const target = view.dom.querySelector('.cm-searchMatch-selected')?.getBoundingClientRect() ?? view.coordsAtPos(range.from)
    const top = view.documentTop + view.lineBlockAt(range.from).top
    return { table: view.contentDOM, y: vertical(target ?? { top, bottom: top + view.defaultLineHeight }), x: 0 }
  }
  const cellFrom = Number(cell.dataset.cellFrom)
  const raw = view.state.doc.sliceString(cellFrom, Number(cell.dataset.cellTo))
  let text = view.state.doc.sliceString(range.from, range.to), from = range.from - cellFrom
  const tree = markdownLanguage.parser.parse(raw)
  const plain = (source: string): string => {
    const template = document.createElement('template')
    template.innerHTML = renderMarkdown(source)
    const dom = template.content
    return dom.firstElementChild?.tagName === 'P' ? dom.firstElementChild.textContent ?? '' : dom.textContent ?? ''
  }
  let image: HTMLElement | undefined
  for (let node = tree.resolveInner(from, 1); node; node = node.parent!) {
    if (node.name === 'Link') {
      const marks = node.getChildren('LinkMark')
      if (marks.length > 1 && from >= marks[1].from) {
        from = marks[0].to
        text = plain(raw.slice(from, marks[1].from))
      }
      break
    }
    if (node.name === 'Image') {
      let index = 0
      tree.iterate({ enter(other) { if (other.name === 'Image' && other.from < node.from) index++ } })
      image = cell.querySelectorAll<HTMLElement>('img')[index]
      break
    }
  }
  const occurrence = text ? plain(raw.slice(0, from)).split(text).length - 1 : 0
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) nodes.push(node as Text)
  const rendered = nodes.map(node => node.data).join('')
  let index = -1
  for (let i = 0; text && i <= occurrence; i++) {
    index = rendered.indexOf(text, index + 1)
    if (index < 0) break
  }
  // Hidden URLs and Markdown syntax still point to the cell's visible content.
  let target = image?.getBoundingClientRect() ?? cell.getBoundingClientRect()
  const at = index < 0 ? 0 : index
  let offset = 0
  for (const node of image ? [] : nodes) {
    if (at < offset + node.length) {
      const match = document.createRange()
      match.setStart(node, at - offset)
      match.setEnd(node, Math.min(node.length, at - offset + (index < 0 ? 1 : text.length)))
      target = match.getBoundingClientRect()
      break
    }
    offset += node.length
  }
  const table = cell.closest<HTMLElement>('.live-table')!
  const visible = table.getBoundingClientRect()
  return {
    table,
    y: vertical(target),
    x: target.left < visible.left ? target.left - visible.left : target.right > visible.right ? target.right - visible.right : 0
  }
}

const previewSearchScroller = ViewPlugin.fromClass(class {
  range: SelectionRange | null = null
  table: HTMLElement | null = null
  observer: ResizeObserver
  stop = () => this.clear()
  constructor(readonly view: EditorView) {
    this.observer = new ResizeObserver(() => this.measure())
    for (const event of ['pointerdown', 'wheel', 'touchstart']) view.scrollDOM.addEventListener(event, this.stop, { capture: true, passive: true })
  }
  clear(): void {
    this.range = null
    this.table = null
    this.observer.disconnect()
  }
  apply(target: NonNullable<ReturnType<typeof searchTarget>>): void {
    if (target.table !== this.table) {
      this.observer.disconnect()
      this.table = target.table
      this.observer.observe(target.table)
    }
    if (target.y) this.view.scrollDOM.scrollTop += target.y
    if (target.x) target.table.scrollLeft += target.x
  }
  scroll(range: SelectionRange): boolean {
    if (!searchPanelOpen(this.view.state) || range.empty) return false
    this.range = range
    this.measure()
    return false
  }
  measure(): void {
    if (!this.range) return
    this.view.requestMeasure({
      key: this,
      read: () => this.range ? searchTarget(this.view, this.range) : null,
      write: target => { if (target && this.range) this.apply(target) }
    })
  }
  update(update: ViewUpdate): void {
    if (!this.range) return
    if (update.docChanged || !update.state.selection.main.eq(this.range) || getSearchQuery(update.state) !== getSearchQuery(update.startState) || !searchPanelOpen(update.state)) this.clear()
    else if (update.geometryChanged) this.measure()
  }
  destroy(): void {
    this.clear()
    for (const event of ['pointerdown', 'wheel', 'touchstart']) this.view.scrollDOM.removeEventListener(event, this.stop, true)
  }
}, {
  // A delayed font/table reflow must not override deliberate manual scrolling.
  eventHandlers: {
    scroll() { this.measure() }
  }
})

export const previewSearchScroll = [previewSearchScroller, EditorView.scrollHandler.of((view, range) => view.plugin(previewSearchScroller)!.scroll(range))]

export const searchChinese = EditorState.phrases.of({
  Find: '查找', Replace: '替换', next: '下一个', previous: '上一个', all: '全选匹配',
  'match case': '区分大小写', regexp: '正则表达式', 'by word': '全字匹配',
  replace: '替换', 'replace all': '全部替换', close: '关闭',
  'current match': '当前匹配', 'replaced match on line $': '已替换第 $ 行的匹配',
  'replaced $ matches': '已替换 $ 处匹配', 'on line': '所在行'
})
