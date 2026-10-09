import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorView, type DecorationSet } from '@codemirror/view'
import { search } from '@codemirror/search'
import { previewDecorations, liveMarkdown, livePreview, deleteHorizontalRule } from './live-preview'
import { renderMarkdown } from '../markdown/render'
import { autoPair } from '../actions/markdown-ops'

function decorations(source: string) {
  let state = EditorState.create({ doc: source, extensions: [liveMarkdown()] })
  expect(ensureSyntaxTree(state, state.doc.length, 1000)).not.toBeNull()
  state = state.update({}).state
  const result: { from: number; to: number; spec: Record<string, unknown> }[] = []
  previewDecorations(state, null).between(0, state.doc.length, (from, to, value) => {
    result.push({ from, to, spec: value.spec })
  })
  return { state, result }
}

describe('live Markdown editing', () => {
  for (const [tag, className] of [['strong', 'live-strong'], ['em', 'live-em'], ['del', 'live-strike'], ['mark', 'live-mark'], ['u', 'live-underline']]) {
    it(`previews inline HTML ${tag} without exposing its markers`, () => {
      const source = `<${tag}>复审：</${tag}>保留`
      const { result } = decorations(source)
      expect(result.some(r => r.spec.class === className && source.slice(r.from, r.to) === '复审：')).toBe(true)
      expect(renderMarkdown(source)).toContain(`<${tag}>复审：</${tag}>保留`)
      expect(result.filter(r => !r.spec.class).map(r => source.slice(r.from, r.to))).toContain(`</${tag}>`)
    })
  }
  it('matches nested HTML tags and ignores tag-like code samples', () => {
    const { result } = decorations('<strong>outer <strong>inner</strong> end</strong>')
    expect(result.filter(r => r.spec.class === 'live-strong')).toHaveLength(2)
    expect(decorations('`<strong>literal</strong>`').result.some(r => r.spec.class === 'live-strong')).toBe(false)
  })
  for (const marker of ['---', '-'.repeat(150), '***', '___', '* * *', '  - - -']) {
    for (const location of ['end', 'inside', 'next-line', 'last-line']) {
      it(`deletes ${marker.slice(0, 10)} as one rule from ${location}`, () => {
        const source = 'before\n\n' + marker + (location === 'last-line' ? '' : '\n\nafter')
        const at = location === 'next-line' ? 8 + marker.length + 1 : 8 + (location === 'inside' ? 2 : marker.length)
        let state = EditorState.create({ doc: source, selection: { anchor: at }, extensions: [liveMarkdown()] })
        const view = { get state() { return state }, dispatch(spec: Parameters<EditorState['update']>[0]) { state = state.update(spec).state } } as unknown as EditorView
        expect(deleteHorizontalRule(view)).toBe(true)
        expect(state.doc.toString()).toBe(location === 'last-line' ? 'before\n' : 'before\n\n\nafter')
      })
    }
  }
  it.each(['---\ntitle: sample\n---', 'heading\n---', '```md\n---\n```', '    ---', 'text---', '- item', '| A |\n| --- |'])('does not delete non-rule syntax: %j', source => {
    const at = source.indexOf('---') + 3
    const state = EditorState.create({ doc: source, selection: { anchor: at < 3 ? source.length : at }, extensions: [liveMarkdown()] })
    expect(deleteHorizontalRule({ state, dispatch() { throw new Error('unexpected deletion') } } as unknown as EditorView)).toBe(false)
  })
  it('reuses preview decorations for ordinary caret motion but updates link editing', () => {
    const source = '# Heading\n\nNormal prose and [link](./target.md)'
    let state = EditorState.create({ doc: source, extensions: [liveMarkdown(), search(), livePreview(null)] })
    expect(ensureSyntaxTree(state, source.length, 1000)).not.toBeNull()
    state = state.update({}).state
    const preview = (s: EditorState) => s.facet(EditorView.decorations).filter(value => typeof value !== 'function')[0] as DecorationSet
    const normal = state.update({ selection: { anchor: source.indexOf('Normal') + 2 } }).state
    expect(preview(normal)).toBe(preview(state))
    const editing = normal.update({ selection: { anchor: source.indexOf('target') + 1 } }).state
    expect(preview(editing)).not.toBe(preview(normal))
    const hidden: string[] = []
    preview(editing).between(0, source.length, (from, to, value) => { if (value.spec.widget === undefined && to > from && !value.spec.class) hidden.push(source.slice(from, to)) })
    expect(hidden).not.toContain('](./target.md)')
  })

  it('decorates separators without treating fenced samples or setext headings as rules', () => {
    const { result } = decorations('开头\n\n---\n\n正文\n\n***\n\n标题\n---\n\n```md\n---\n```')
    expect(result.filter(r => String(r.spec.class).startsWith('live-rule'))).toHaveLength(2)
  })
  it('indents nested list items and continuation lines without changing code indentation', () => {
    const source = '- parent\n  continued\n  - child\n    - grandchild\n\n  ```md\n  - literal\n  ```'
    const { result } = decorations(source)
    const lists = result.filter(r => String(r.spec.class).startsWith('live-list'))
    expect(lists.map(r => r.spec.attributes)).toEqual([
      { style: '--list-depth: 1' }, { style: '--list-depth: 1' },
      { style: '--list-depth: 2' }, { style: '--list-depth: 3' }, { style: '--list-depth: 1' }
    ])
    expect(lists.some(r => r.from === source.indexOf('  - literal'))).toBe(false)
  })

  it('centers standalone and linked images, keeps them rendered under selection, and leaves inline images in prose', () => {
    const source = '![alone](./a.png)\n\n[![linked](./b.png)](./doc.md)\n\ntext ![inline](./c.png) after'
    const { state, result } = decorations(source)
    expect(result.filter(r => r.spec.class === 'live-image-line').map(r => r.from)).toEqual([0, source.indexOf('[![linked]')])
    const selected = state.update({ selection: { anchor: 2, head: 7 } }).state
    const widgets: unknown[] = []
    previewDecorations(selected, null).between(0, 18, (_from, _to, value) => { if (value.spec.widget) widgets.push(value.spec.widget) })
    expect(widgets).toHaveLength(1)
  })
  it('shows front matter as metadata, not as a rule and a heading', () => {
    const source = '---\ntitle: 欢迎\n---\n\n# 正文\n\n---\n'
    const { result } = decorations(source)
    expect(result.filter((r) => r.spec.class === 'live-frontmatter').map((r) => r.from)).toEqual([0, 4, 14])
    expect(result.filter((r) => String(r.spec.class).startsWith('live-heading')).map((r) => r.from)).toEqual([19])
    expect(result.filter((r) => r.spec.widget).map((r) => r.from)).toEqual([25])
    expect(renderMarkdown(source)).not.toContain('<h2')
    expect(renderMarkdown('---\n\n正文')).toContain('<hr>')
  })

  it('styles prose without rewriting its Markdown or image paths', () => {
    const source = '# 标题\n\n**加粗** 和 *斜体*，`code`，==高亮==\n\n![图](./文档_img/a.png)'
    const { state, result } = decorations(source)
    expect(state.doc.toString()).toBe(source)
    expect(result.some((r) => r.spec.class === 'live-heading live-h1')).toBe(true)
    expect(result.some((r) => r.spec.class === 'live-strong')).toBe(true)
    expect(result.some((r) => r.spec.class === 'live-mark')).toBe(true)
    expect(result.some((r) => r.from === 0 && r.to === 2)).toBe(true)
    expect(result.some((r) => r.spec.widget && source.slice(r.from, r.to).startsWith('!['))).toBe(true)
  })

  it('renders tables as blocks, keeping their exact source offsets', () => {
    const source = '段落\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n尾部'
    const { result } = decorations(source)
    const table = result.find((r) => r.spec.block)
    expect(source.slice(table!.from, table!.to)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('does not treat Markdown inside a fenced code block as prose', () => {
    const { result } = decorations('```md\n# literal\n**literal**\n```')
    expect(result.some((r) => r.spec.class === 'live-strong')).toBe(false)
    expect(result.some((r) => r.spec.class === 'live-heading live-h1')).toBe(false)
  })

  it('keeps code text editable and its layout stable when the caret enters it', () => {
    const source = '正文\n\n```js\nconst value = 123\n```\n\n尾部'
    const { state, result } = decorations(source)
    expect(result.some((r) => r.spec.block)).toBe(false)
    expect(result.filter((r) => String(r.spec.class).startsWith('live-code-line'))).toHaveLength(3)
    const inside = state.update({ selection: { anchor: source.indexOf('value') } }).state
    const after: {from: number; to: number; spec: Record<string, unknown>}[] = []
    previewDecorations(inside, null).between(0, source.length, (from, to, value) => { after.push({from, to, spec: value.spec}) })
    const layout = (items: typeof result) => items.map(r => ({ ...r, spec: { ...r.spec, class: String(r.spec.class).replace(' is-active', '') } }))
    expect(layout(after)).toEqual(layout(result))
  })

  it('keeps an opening fence visible and unpaired until Enter, then hides its markers and detects the body', () => {
    for (const prefix of ['', '`', '``']) expect(autoPair(prefix, prefix.length, null, '`')).toBeNull()
    expect(autoPair('text ', 5, null, '`')).not.toBeNull()
    expect(decorations('```').result).toEqual([])
    const source = '```\ndef greet(name):\n    return name\n```'
    const { result, state } = decorations(source)
    const header = result.find(r => r.spec.widget)
    expect(header?.spec.widget).toMatchObject({ lang: '', detected: 'python' })
    expect(renderMarkdown(source)).toContain('hljs-keyword')
    expect(state.doc.toString()).toBe(source)
    expect(result.some(r => r.from === source.lastIndexOf('```') && r.to === source.length)).toBe(true)
  })
})
