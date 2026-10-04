import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { linkAt, unlinkAt } from './links'
import { liveMarkdown, previewDecorations } from '../editor/live-preview'

describe('Markdown links', () => {
  it('removes only the link around the caret and preserves its label and neighbors', () => {
    for (const link of ['[**read**](a_(b).md "title")', '[**read**][ref]', '[**read**][]', '[**read**]']) {
      const source = `before ${link} after [other](other.md)\n\n[ref]: README.md\n[**read**]: README.md`
      const change = unlinkAt(source, source.indexOf('read') + 1)!
      expect(source.slice(0, change.from) + change.text + source.slice(change.to)).toBe(source.replace(link, '**read**'))
    }
    expect(unlinkAt('https://example.com then [other](x.md)', 5)).toBeNull()
    expect(unlinkAt('plain text then [other](x.md)', 5)).toBeNull()
  })
  it.each([
    ['[English](README.md) · [简体中文](README.zh-CN.md)', 'English', 'README.md'],
    ['[English](README.md) · [简体中文](README.zh-CN.md)', '简体中文', 'README.zh-CN.md'],
    ['[title](https://example.com/a_(b) "description")', 'title', 'https://example.com/a_(b)'],
    ['[文件](<./中文 文档.md>)', '文件', './%E4%B8%AD%E6%96%87%20%E6%96%87%E6%A1%A3.md'],
    ['[**bold**](README.md)', 'bold', 'README.md'],
    ['[read][doc]\n\n[doc]: README.md "title"', 'read', 'README.md'],
    ['[read][]\n\n[read]: README.md', 'read', 'README.md'],
    ['[read]\n\n[read]: README.md', 'read', 'README.md'],
    ['<https://example.com>', 'example', 'https://example.com'],
    ['https://example.com', 'example', 'https://example.com'],
    ['www.example.com', 'example', 'http://www.example.com'],
    ['**https://example.com**', 'example', 'https://example.com'],
    ['<writer@example.com>', 'writer', 'mailto:writer@example.com'],
    ['[标题](#中文标题)', '标题', '#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98'],
    ['> - [link](README.md)', 'link', 'README.md'],
    ['| Doc |\n| --- |\n| [link](README.md) |', 'link', 'README.md']
  ])('resolves %s', (source, label, href) => {
    expect(linkAt(source, source.indexOf(label) + 1)).toBe(href)
  })

  it.each([
    '`[link](README.md)`',
    '```md\n[link](README.md)\n```',
    '    [link](README.md)',
    '![link](image.png)',
    '[link]\\(README.md)',
    '[link](javascript:alert(1))',
    '---\ntitle: [link](README.md)\n---',
    '[link]: README.md',
    '[link][missing]'
  ])('does not invent a link in %s', source => {
    expect(linkAt(source, source.indexOf('link') + 1)).toBeNull()
  })

  it('decorates links without changing source or discarding formatting inside labels', () => {
    const source = '[**English**](README.md) · [中文][zh]\n\n[zh]: README.zh-CN.md\n\nhttps://example.com'
    const state = EditorState.create({ doc: source, extensions: [liveMarkdown()] })
    ensureSyntaxTree(state, state.doc.length, 1000)
    const hrefs: string[] = []
    let bold = false
    previewDecorations(state, null).between(0, source.length, (_from, _to, value) => {
      if (value.spec.attributes?.['data-md-href']) hrefs.push(value.spec.attributes['data-md-href'])
      if (value.spec.class === 'live-strong') bold = true
    })
    expect(hrefs.sort()).toEqual(['README.md', 'README.zh-CN.md', 'https://example.com'].sort())
    expect(bold).toBe(true)
    expect(state.doc.toString()).toBe(source)
  })
})
