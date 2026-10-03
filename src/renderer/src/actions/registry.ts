import type { ActionContext, ActionDef } from './types'
import {
  autoPair,
  INLINE_WRAPPERS,
  insertBlock,
  insertCodeBlock,
  insertTable,
  LINE_PREFIXES,
  setHeading,
  tidyMarkdown,
  toPlainText,
  toggleInline,
  toggleLinePrefix
} from './markdown-ops'

/**
 * Every user-visible operation in the app.
 *
 * `group` decides which context-menu section an item lands in; the order of
 * `GROUP_ORDER` decides the section order. Nothing here knows about React,
 * which is what lets the palette, the menus and the key handler share it.
 */
export const GROUPS = [
  'format',
  'convert',
  'insert',
  'find',
  'clipboard',
  'table-row',
  'table-col',
  'table-cell',
  'table-data',
  'table-style',
  'table-struct',
  'code',
  'image',
  'link',
  'file',
  'view'
] as const

export type GroupId = (typeof GROUPS)[number]

export const GROUP_LABELS: Record<GroupId, string> = {
  format: '格式',
  convert: '转换为',
  insert: '插入',
  find: '查找',
  clipboard: '剪贴板',
  'table-row': '行',
  'table-col': '列',
  'table-cell': '单元格',
  'table-data': '数据',
  'table-style': '样式',
  'table-struct': '结构',
  code: '代码',
  image: '图片',
  link: '链接',
  file: '文件',
  view: '视图'
}

/** Wrappers exposed as one action each so a key can bind to any of them. */
const inline = (
  id: string,
  title: string,
  key: string,
  wrap: string,
  keywords: string[]
): ActionDef => ({
  id,
  title,
  keywords,
  scope: 'document',
  key,
  group: 'format',
  run: (ctx) => {
    const { start, end } = ctx.selection ?? { start: ctx.cursor, end: ctx.cursor }
    const res = toggleInline(ctx.source, start, end, wrap)
    ctx.replace(0, ctx.source.length, res.text, res.cursor)
    if (res.selection) ctx.select(res.selection[0], res.selection[1])
  }
})

const prefix = (toggle: (typeof LINE_PREFIXES)[number], key?: string): ActionDef => ({
  id: `prefix.${toggle.id}`,
  title: toggle.title,
  keywords: ['list', 'quote', 'bullet', 'ordered', 'task'],
  scope: 'document',
  key,
  group: 'convert',
  run: (ctx) => {
    const { start, end } = ctx.selection ?? { start: ctx.cursor, end: ctx.cursor }
    const res = toggleLinePrefix(ctx.source, start, end, toggle.prefix)
    ctx.replace(0, ctx.source.length, res.text, res.cursor)
    if (res.selection) ctx.select(res.selection[0], res.selection[1])
  }
})

const heading = (level: number): ActionDef => ({
  id: `heading.${level}`,
  title: level === 0 ? '正文段落' : `标题 H${level}`,
  keywords: ['heading', 'title', `h${level}`],
  scope: 'document',
  key: level > 0 ? `Ctrl+Shift+Digit${level}` : 'Ctrl+Shift+Digit0',
  group: 'convert',
  run: (ctx) => {
    const { start, end } = ctx.selection ?? { start: ctx.cursor, end: ctx.cursor }
    const res = setHeading(ctx.source, start, end, level)
    ctx.replace(0, ctx.source.length, res.text, res.cursor)
  }
})

/** Alt text from the original filename — never from the hashed stored name. */
function altTextFor(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? ''
  return base.replace(/\.[^.]+$/, '') || '图片'
}

/** Table actions land here once the table engine module is present. */
const tableStub = (
  id: string,
  title: string,
  key: string,
  group: GroupId,
  keywords: string[] = []
): ActionDef => ({
  id,
  title,
  keywords,
  scope: 'table',
  key,
  group,
  enabled: () => false,
  disabledReason: () => '表格引擎尚未接入',
  run: () => undefined
})

export const ACTIONS: ActionDef[] = [
  // ---- inline formatting --------------------------------------------------
  inline('format.bold', '加粗', 'Ctrl+B', INLINE_WRAPPERS.bold, ['bold', 'strong']),
  inline('format.italic', '斜体', 'Ctrl+I', INLINE_WRAPPERS.italic, ['italic', 'em']),
  inline('format.underline', '下划线', 'Ctrl+U', INLINE_WRAPPERS.underline, ['underline']),
  inline('format.strike', '删除线', 'Ctrl+Shift+X', INLINE_WRAPPERS.strike, ['strikethrough', 'del']),
  inline('format.code', '行内代码', 'Ctrl+E', INLINE_WRAPPERS.code, ['code', 'inline']),
  inline('format.mark', '高亮', 'Ctrl+Shift+H', INLINE_WRAPPERS.mark, ['mark', 'highlight']),

  // ---- block conversion ---------------------------------------------------
  ...LINE_PREFIXES.map((t, i) =>
    prefix(t, ['Ctrl+Shift+Digit8', 'Ctrl+Shift+Digit7', 'Ctrl+Shift+Digit9', 'Ctrl+Shift+U'][i])
  ),
  heading(1),
  heading(2),
  heading(3),
  heading(4),
  heading(5),
  heading(6),
  heading(0),

  // ---- insert -------------------------------------------------------------
  {
    id: 'insert.link',
    title: '链接',
    keywords: ['link', 'url'],
    scope: 'document',
    key: 'Ctrl+K',
    group: 'insert',
    run: (ctx) => {
      const { start, end } = ctx.selection ?? { start: ctx.cursor, end: ctx.cursor }
      const label = ctx.source.slice(start, end)
      const text = `${ctx.source.slice(0, start)}[${label}](url)${ctx.source.slice(end)}`
      const urlStart = start + label.length + 3
      ctx.replace(0, ctx.source.length, text, urlStart)
      ctx.select(urlStart, urlStart + 3)
    }
  },
  {
    id: 'insert.image',
    title: '插入图片',
    keywords: ['image', 'picture', 'paste'],
    scope: 'document',
    key: 'Ctrl+Shift+I',
    group: 'insert',
    run: (ctx) => {
      void (async () => {
        if (!ctx.docPath) {
          ctx.toast('先打开一个文档', 'error')
          return
        }
        const paths = await window.mdview.dialog.openImages()
        if (!paths || paths.length === 0) return
        const inserted = await window.mdview.asset.fromFiles(ctx.docPath, paths)
        if (inserted.length === 0) return
        const lines = inserted.map((a) => `![${altTextFor(paths[0])}](${a.relPath})`)
        // One image goes inline at the cursor; several get their own lines so
        // they render as stacked figures rather than one paragraph.
        const text = lines.length === 1 ? lines[0] : `\n\n${lines.join('\n')}\n\n`
        ctx.replace(ctx.cursor, ctx.cursor, text, ctx.cursor + text.length)
      })()
    }
  },
  {
    id: 'insert.codeblock',
    title: '代码块',
    keywords: ['code', 'fence'],
    scope: 'document',
    key: 'Ctrl+Shift+C',
    group: 'insert',
    run: (ctx) => {
      const res = insertCodeBlock(ctx.source, ctx.cursor)
      ctx.replace(0, ctx.source.length, res.text, res.cursor)
    }
  },
  {
    id: 'insert.table',
    title: '插入表格',
    keywords: ['table', 'grid'],
    scope: 'document',
    key: 'Ctrl+Alt+T',
    group: 'insert',
    // The size picker is a UI concern; 3×3 is the sane default for a shortcut
    // and the palette offers the full picker.
    run: (ctx) => {
      const res = insertTable(ctx.source, ctx.cursor, 3, 3)
      ctx.replace(0, ctx.source.length, res.text, res.cursor)
    }
  },
  {
    id: 'insert.footnote',
    title: '插入脚注',
    keywords: ['footnote', 'note'],
    scope: 'document',
    key: 'Ctrl+Shift+W',
    group: 'insert',
    run: (ctx) => ctx.insertBlock('[^1]\n\n[^1]: ')
  },
  {
    id: 'insert.math',
    title: '插入数学块',
    keywords: ['math', 'latex', 'katex', 'formula'],
    scope: 'document',
    key: 'Ctrl+Alt+M',
    group: 'insert',
    run: (ctx) => {
      const res = insertBlock(ctx.source, ctx.cursor, '$$\n\n$$')
      ctx.replace(0, ctx.source.length, res.text, res.cursor - 3)
    }
  },
  {
    id: 'insert.mermaid',
    title: '插入 Mermaid 图',
    keywords: ['mermaid', 'diagram', 'chart', 'flowchart'],
    scope: 'document',
    key: 'Ctrl+Alt+K',
    group: 'insert',
    run: (ctx) => {
      const res = insertBlock(ctx.source, ctx.cursor, '```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```')
      ctx.replace(0, ctx.source.length, res.text, res.cursor)
    }
  },
  {
    id: 'insert.toc',
    title: '插入目录',
    keywords: ['toc', 'outline', 'contents'],
    scope: 'document',
    key: 'Ctrl+Alt+C',
    group: 'insert',
    run: (ctx) => ctx.insertBlock('[TOC]')
  },
  {
    id: 'insert.hr',
    title: '插入分隔线',
    keywords: ['hr', 'divider', 'rule', 'separator'],
    scope: 'document',
    key: 'Ctrl+Alt+H',
    group: 'insert',
    run: (ctx) => ctx.insertBlock('---')
  },
  {
    id: 'insert.details',
    title: '插入折叠块',
    keywords: ['details', 'collapse', 'fold'],
    scope: 'document',
    group: 'insert',
    run: (ctx) =>
      ctx.insertBlock('<details>\n<summary>展开</summary>\n\n\n</details>')
  },
  {
    id: 'insert.pagebreak',
    title: '插入分页符',
    keywords: ['page break', 'pdf'],
    scope: 'document',
    group: 'insert',
    run: (ctx) => ctx.insertBlock('<div style="page-break-after: always"></div>')
  },

  // ---- clipboard / find ---------------------------------------------------
  {
    id: 'clipboard.copyPlain',
    title: '复制为纯文本',
    keywords: ['copy', 'plain'],
    scope: 'document',
    key: 'Ctrl+Shift+Alt+C',
    group: 'clipboard',
    run: (ctx) => {
      const { start, end } = ctx.selection ?? { start: 0, end: ctx.source.length }
      void window.mdview.clipboard.writeText(toPlainText(ctx.source.slice(start, end)))
      ctx.toast('已复制为纯文本', 'success')
    }
  },
  {
    id: 'clipboard.copyAll',
    title: '复制全文',
    scope: 'document',
    group: 'clipboard',
    run: (ctx) => void window.mdview.clipboard.writeText(ctx.source)
  },
  {
    id: 'find.selection',
    title: '查找选中内容',
    keywords: ['find', 'search'],
    scope: 'find',
    key: 'Ctrl+Shift+F',
    group: 'find',
    run: () => undefined // wired by the search panel once it lands
  },
  {
    id: 'view.toggleTheme',
    title: '切换深浅主题',
    keywords: ['theme', 'dark', 'light'],
    scope: 'app',
    key: 'Ctrl+Shift+T',
    group: 'view',
    run: (ctx) => {
      void import('../state/settings').then(({ settingsSnapshot, patchSettings }) => {
        const next = settingsSnapshot().theme === 'light' ? 'dark' : 'light'
        void patchSettings({ theme: next })
        ctx.toast(next === 'dark' ? '已切换到深色' : '已切换到浅色')
      })
    }
  },
  {
    id: 'view.toggleSidebar',
    title: '显示 / 隐藏侧栏',
    keywords: ['sidebar', 'panel'],
    scope: 'app',
    key: 'Ctrl+Backslash',
    group: 'view',
    run: () => {
      void import('../state/settings').then(({ settingsSnapshot, patchSettings }) =>
        patchSettings({ sidebarVisible: !settingsSnapshot().sidebarVisible })
      )
    }
  },

  // ---- document hygiene ---------------------------------------------------
  {
    id: 'document.tidy',
    title: '格式化文档',
    keywords: ['format', 'tidy', 'clean', 'normalise'],
    scope: 'document',
    key: 'Ctrl+Alt+F',
    group: 'file',
    run: (ctx) => {
      const next = tidyMarkdown(ctx.source)
      if (next === ctx.source) {
        ctx.toast('文档已是规范格式')
        return
      }
      ctx.replace(0, ctx.source.length, next, Math.min(ctx.cursor, next.length))
    }
  },

  // ---- table: rows --------------------------------------------------------
  tableStub('table.row.insertAbove', '上方插入行', 'Ctrl+Enter', 'table-row', ['row', 'insert']),
  tableStub('table.row.insertBelow', '下方插入行', 'Shift+Enter', 'table-row'),
  tableStub('table.row.delete', '删除本行', 'Ctrl+Shift+Backspace', 'table-row', ['delete', 'row']),
  tableStub('table.row.moveUp', '上移本行', 'Alt+ArrowUp', 'table-row'),
  tableStub('table.row.moveDown', '下移本行', 'Alt+ArrowDown', 'table-row'),
  tableStub('table.row.copy', '复制本行', 'Ctrl+Shift+D', 'table-row'),
  tableStub('table.row.cut', '剪切本行', 'Ctrl+Shift+X', 'table-row'),

  // ---- table: columns -----------------------------------------------------
  tableStub('table.col.insertLeft', '左侧插入列', 'Ctrl+Shift+Enter', 'table-col'),
  tableStub('table.col.insertRight', '右侧插入列', 'Ctrl+Alt+Enter', 'table-col'),
  tableStub('table.col.delete', '删除本列', 'Ctrl+Alt+Backspace', 'table-col'),
  tableStub('table.col.moveLeft', '左移本列', 'Alt+ArrowLeft', 'table-col'),
  tableStub('table.col.moveRight', '右移本列', 'Alt+ArrowRight', 'table-col'),
  tableStub('table.col.alignLeft', '本列左对齐', 'Ctrl+Alt+L', 'table-col'),
  tableStub('table.col.alignCenter', '本列居中', 'Ctrl+Alt+C', 'table-col'),
  tableStub('table.col.alignRight', '本列右对齐', 'Ctrl+Alt+R', 'table-col'),

  // ---- table: cells -------------------------------------------------------
  tableStub('table.cell.merge', '合并单元格', 'Ctrl+M', 'table-cell'),
  tableStub('table.cell.split', '拆分单元格', 'Ctrl+Shift+M', 'table-cell'),
  tableStub('table.cell.clear', '清空单元格', 'Delete', 'table-cell'),
  tableStub('table.cell.newline', '单元格内换行', 'Shift+Enter', 'table-cell'),

  // ---- table: data --------------------------------------------------------
  tableStub('table.sort.asc', '按本列升序', 'Ctrl+Alt+ArrowUp', 'table-data', ['sort']),
  tableStub('table.sort.desc', '按本列降序', 'Ctrl+Alt+ArrowDown', 'table-data'),
  tableStub('table.select.all', '选中整张表', 'Ctrl+Shift+Space', 'table-data'),
  tableStub('table.stats.sum', '本列求和', '', 'table-data'),
  tableStub('table.stats.avg', '本列均值', '', 'table-data'),
  tableStub('table.stats.count', '本列计数', '', 'table-data'),
  tableStub('table.stats.min', '本列最小值', '', 'table-data'),
  tableStub('table.stats.max', '本列最大值', '', 'table-data'),
  tableStub('table.paste.fromClipboard', '从剪贴板建表', 'Ctrl+Alt+V', 'table-data'),
  tableStub('table.paste.fromExcel', '从 Excel 粘贴', '', 'table-data'),

  // ---- table: styling -----------------------------------------------------
  tableStub('table.style.pad', '整表美化（对齐竖线）', 'Ctrl+Alt+P', 'table-style'),
  tableStub('table.style.zebra', '斑马纹', '', 'table-style'),
  tableStub('table.style.compact', '紧凑样式', '', 'table-style'),
  tableStub('table.style.borderless', '无边框', '', 'table-style'),
  tableStub('table.style.card', '卡片样式', '', 'table-style'),
  tableStub('table.style.center', '表格居中', '', 'table-style'),

  // ---- table: structure ---------------------------------------------------
  tableStub('table.struct.transpose', '转置表格', 'Ctrl+Alt+X', 'table-struct'),
  tableStub('table.struct.headerOn', '首行设为表头', '', 'table-struct'),
  tableStub('table.struct.headerOff', '取消表头', '', 'table-struct'),
  tableStub('table.struct.toCsv', '表格转 CSV', '', 'table-struct'),
  tableStub('table.struct.fromCsv', 'CSV 转表格', '', 'table-struct'),
  tableStub('table.struct.toJson', '表格转 JSON', '', 'table-struct'),
  tableStub('table.struct.toList', '表格转列表', '', 'table-struct'),
  tableStub('table.struct.exportCsv', '导出本表为 CSV', '', 'table-struct'),
  tableStub('table.struct.delete', '删除整张表格', '', 'table-struct'),

  // ---- code block ---------------------------------------------------------
  {
    id: 'code.copy',
    title: '复制代码',
    keywords: ['copy', 'code'],
    scope: 'codeblock',
    key: 'Ctrl+Shift+Alt+E',
    group: 'code',
    run: (ctx) => {
      const block = codeAt(ctx.source, ctx.cursor)
      if (!block) return
      void window.mdview.clipboard.writeText(block.body)
      ctx.toast('已复制代码', 'success')
    }
  },
  {
    id: 'code.selectAll',
    title: '全选代码块',
    scope: 'codeblock',
    key: 'Ctrl+Shift+A',
    group: 'code',
    run: (ctx) => {
      const block = codeAt(ctx.source, ctx.cursor)
      if (!block) return
      ctx.select(block.bodyStart, block.bodyEnd)
    }
  },
  {
    id: 'code.unwrap',
    title: '解包为纯文本',
    keywords: ['unwrap', 'strip', 'fence'],
    scope: 'codeblock',
    group: 'code',
    run: (ctx) => {
      const block = codeAt(ctx.source, ctx.cursor)
      if (!block) return
      ctx.replace(block.start, block.end, block.body, block.start)
    }
  },
  {
    id: 'code.toInline',
    title: '转换为行内代码',
    scope: 'codeblock',
    group: 'code',
    run: (ctx) => {
      const block = codeAt(ctx.source, ctx.cursor)
      if (!block) return
      const inline = block.body.split('\n').join(' ')
      ctx.replace(block.start, block.end, `\`${inline}\``, block.start)
    }
  },
  {
    id: 'code.pickLanguage',
    title: '指定语言',
    keywords: ['language', 'lang', 'syntax'],
    scope: 'codeblock',
    group: 'code',
    run: () => undefined // opens the language popover in the UI layer
  },

  // ---- image / link -------------------------------------------------------
  {
    id: 'image.fullscreen',
    title: '全屏查看',
    keywords: ['zoom', 'preview'],
    scope: 'image',
    key: 'Z',
    group: 'image',
    run: () => undefined
  },
  {
    id: 'image.copyPath',
    title: '复制图片路径',
    scope: 'image',
    group: 'image',
    run: (ctx) => {
      void window.mdview.clipboard.writeText(relImageAt(ctx.source, ctx.cursor) ?? '')
      ctx.toast('路径已复制', 'success')
    }
  },
  {
    id: 'image.reveal',
    title: '在文件管理器中显示',
    scope: 'image',
    group: 'image',
    run: () => undefined
  },
  {
    id: 'image.delete',
    title: '删除图片',
    scope: 'image',
    group: 'image',
    run: (ctx) => {
      const span = imageSpanAt(ctx.source, ctx.cursor)
      if (!span) return
      ctx.replace(span[0], span[1], '', span[0])
    }
  },
  {
    id: 'link.open',
    title: '打开链接',
    scope: 'link',
    group: 'link',
    run: (ctx) => {
      const href = linkAt(ctx.source, ctx.cursor)
      if (href && /^https?:/.test(href)) void window.mdview.shell.openExternal(href)
    }
  },
  {
    id: 'link.copy',
    title: '复制链接地址',
    scope: 'link',
    group: 'link',
    run: (ctx) => {
      void window.mdview.clipboard.writeText(linkAt(ctx.source, ctx.cursor) ?? '')
      ctx.toast('链接已复制', 'success')
    }
  },
  {
    id: 'link.remove',
    title: '移除链接（保留文字）',
    scope: 'link',
    group: 'link',
    run: (ctx) => {
      const m = /\[([^\]]*)\]\(([^)]*)\)/.exec(ctx.source.slice(ctx.cursor, ctx.cursor + 400))
      if (!m) return
      ctx.replace(ctx.cursor, ctx.cursor + m[0].length, m[1], ctx.cursor)
    }
  }
]

/* ---------------------------------------------------------------- selectors */

export function actionsIn(group: string): ActionDef[] {
  return ACTIONS.filter((a) => a.group === group)
}

export function findAction(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id)
}

/** Every binding in the registry, for the cheat-sheet overlay. */
export function allBindings(): { key: string; title: string; id: string }[] {
  return ACTIONS.filter((a) => a.key).map((a) => ({
    key: a.key as string,
    title: a.title,
    id: a.id
  }))
}

/* --------------------------------------------------------- source scanners */

export interface CodeBlockSpan {
  start: number
  end: number
  bodyStart: number
  bodyEnd: number
  lang: string
  body: string
}

/** The fenced block containing `offset`, if any. */
export function codeAt(src: string, offset: number): CodeBlockSpan | null {
  const re = /^```(\w*)[^\n]*\n([\s\S]*?)^```/gm
  for (const m of src.matchAll(re)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (offset >= start && offset <= end) {
      const bodyStart = start + m[0].indexOf('\n') + 1
      return {
        start,
        end,
        bodyStart,
        bodyEnd: bodyStart + m[2].length,
        lang: m[1] ?? '',
        body: m[2]
      }
    }
  }
  return null
}

export function imageSpanAt(src: string, offset: number): [number, number] | null {
  const re = /!\[[^\]]*\]\([^)]*\)/g
  for (const m of src.matchAll(re)) {
    const start = m.index ?? 0
    if (offset >= start && offset <= start + m[0].length) return [start, start + m[0].length]
  }
  return null
}

export function relImageAt(src: string, offset: number): string | null {
  const span = imageSpanAt(src, offset)
  if (!span) return null
  return /!\[[^\]]*\]\(([^)]*)\)/.exec(src.slice(span[0], span[1]))?.[1] ?? null
}

export function linkAt(src: string, offset: number): string | null {
  const re = /\[[^\]]*\]\(([^)]+)\)/g
  for (const m of src.matchAll(re)) {
    const start = m.index ?? 0
    if (offset >= start && offset <= start + m[0].length) return m[1]
  }
  return null
}

/* -------------------------------------------------------- auto-pair bridge */

export { autoPair }
export type { ActionContext }
