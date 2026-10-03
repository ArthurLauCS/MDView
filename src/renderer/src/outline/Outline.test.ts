import { describe, expect, it } from 'vitest'
import { extractHeadings, headingAt, slugify } from './headings'

const lines = (...l: string[]): string => l.join('\n')

describe('extractHeadings', () => {
  it('reads ATX headings with their line numbers', () => {
    const src = lines('# 一', '正文', '## 二', '### 三')
    const h = extractHeadings(src)
    expect(h.map((x) => [x.level, x.text, x.line])).toEqual([
      [1, '一', 1],
      [2, '二', 3],
      [3, '三', 4]
    ])
  })

  it('ignores a heading inside a fenced block', () => {
    const src = lines('# 真标题', '', '```', '# 这是代码注释', '```', '', '## 另一个真标题')
    const h = extractHeadings(src)
    expect(h.map((x) => x.text)).toEqual(['真标题', '另一个真标题'])
  })

  it('tracks tilde fences too', () => {
    const src = lines('~~~', '# 注释', '~~~', '# 真标题')
    expect(extractHeadings(src).map((x) => x.text)).toEqual(['真标题'])
  })

  it('resumes after a fence closes', () => {
    const src = lines('```', '# 注释', '```', '# 之后')
    expect(extractHeadings(src).map((x) => x.text)).toEqual(['之后'])
  })

  it('reads setext headings', () => {
    const src = lines('一级标题', '===', '二级标题', '---')
    const h = extractHeadings(src)
    expect(h.map((x) => [x.level, x.text])).toEqual([
      [1, '一级标题'],
      [2, '二级标题']
    ])
  })

  it('does not mistake a thematic break for an underline', () => {
    // A `---` after a blank line is a rule, not a heading.
    const h = extractHeadings(lines('正文', '', '---', '', '更多正文'))
    expect(h).toEqual([])
  })

  it('uses the same single-dash setext heading as the editor parser', () => {
    expect(extractHeadings(lines('正文', '-'))[0]).toMatchObject({ text: '正文', level: 2 })
  })

  it('strips inline markup from the label', () => {
    const h = extractHeadings('## **加粗** 与 `代码` 与 [链接](x.md)')
    expect(h[0].text).toBe('加粗 与 代码 与 链接')
  })

  it('trims trailing closing hashes', () => {
    expect(extractHeadings('## 标题 ##')[0].text).toBe('标题')
  })

  it('requires a space after the hashes', () => {
    expect(extractHeadings('#没有空格')).toEqual([])
  })

  it('ignores more than six hashes', () => {
    expect(extractHeadings('####### 七级')).toEqual([])
  })

  it('offsets point at the heading start', () => {
    const src = lines('前言', '# 标题')
    const h = extractHeadings(src)
    expect(src.slice(h[0].offset, h[0].offset + 2)).toBe('# ')
  })

  it('indents from the shallowest heading present', () => {
    // The document starts at `##`, so that is depth 0 and `###` is depth 1.
    const h = extractHeadings(lines('## 甲', '### 乙', '#### 丙'))
    expect(h.map((x) => x.depth)).toEqual([0, 1, 2])
  })

  it('returns nothing for a document with no headings', () => {
    expect(extractHeadings('只有正文，没有任何标题。')).toEqual([])
  })

  it('builds actual ancestry when levels are skipped or return to a shallower heading', () => {
    const h = extractHeadings(lines('## 开始', '#### 细节', '### 旁支', '# 新章', '###### 跳级'))
    expect(h.map((x) => x.depth)).toEqual([0, 1, 1, 0, 1])
  })

  it('keeps repeated headings independently addressable', () => {
    const h = extractHeadings(lines('# 重复', '## 重复', '# 重复'))
    expect(new Set(h.map((x) => x.id)).size).toBe(3)
    expect(h.map((x) => x.offset)).toEqual([0, 5, 11])
  })

  it('recognizes indented headings and CRLF while preserving trailing content hashes', () => {
    const src = '前言\r\n\r\n  ## C#\r\n\r\n### 标题###\r\n'
    const h = extractHeadings(src)
    expect(h.map((x) => [x.text, x.line])).toEqual([['C#', 3], ['标题###', 5]])
    expect(src.slice(h[0].offset, h[0].offset + 2)).toBe('##')
  })

  it('does not close a long fence at a shorter nested fence', () => {
    const src = lines('````md', '```', '# 示例', '```', '````', '', '# 正文')
    expect(extractHeadings(src).map((x) => x.text)).toEqual(['正文'])
  })

  it('ignores indented code and HTML block contents', () => {
    const src = lines('    # 代码', '', '<div>', '# HTML 内容', '</div>', '', '# 正文')
    expect(extractHeadings(src).map((x) => x.text)).toEqual(['正文'])
  })

  it('handles an empty document', () => {
    expect(extractHeadings('')).toEqual([])
  })

  it('produces the same slug the renderer anchors use', () => {
    // Two headings with identical text get the same slug here; the renderer
    // dedupes, so the outline links the first occurrence, which is the
    // behaviour a reader expects from a table of contents.
    expect(extractHeadings('## 排版层级')[0].id).toBe(slugify('排版层级'))
  })

  it('lowercases and hyphenates a latin heading', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
})

describe('headingAt', () => {
  const src = lines('# 甲', 'a', '## 乙', 'b', '## 丙', 'c')
  const headings = extractHeadings(src)

  it('finds the section an offset sits in', () => {
    const at = src.indexOf('b')
    expect(headingAt(headings, at)?.text).toBe('乙')
  })

  it('returns the last heading before the offset', () => {
    expect(headingAt(headings, src.length - 1)?.text).toBe('丙')
  })

  it('returns null before the first heading', () => {
    // Offset 2 is inside `# 甲`, before the next heading begins.
    expect(headingAt(headings, -1)).toBeNull()
  })

  it('reports no section for a caret in the preamble', () => {
    // Before the first heading there is no section yet — the outline should
    // not claim the caret is in the document's first section.
    const withPreamble = extractHeadings(lines('前言', '# 甲'))
    expect(headingAt(withPreamble, 0)).toBeNull()
    expect(headingAt(withPreamble, withPreamble[0].offset)?.text).toBe('甲')
  })

  it('returns null for an empty outline', () => {
    expect(headingAt([], 100)).toBeNull()
  })
})
