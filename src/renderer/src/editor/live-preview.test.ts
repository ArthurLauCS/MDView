import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { previewDecorations, liveMarkdown } from './live-preview'
import { renderMarkdown } from '../markdown/render'
import { autoPair } from '../actions/markdown-ops'

function decorations(source: string) {
  const state = EditorState.create({ doc: source, extensions: [liveMarkdown()] })
  ensureSyntaxTree(state, state.doc.length, 1000)
  const result: { from: number; to: number; spec: Record<string, unknown> }[] = []
  previewDecorations(state, null).between(0, state.doc.length, (from, to, value) => {
    result.push({ from, to, spec: value.spec })
  })
  return { state, result }
}

describe('live Markdown editing', () => {
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
