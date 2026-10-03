import { describe, expect, it } from 'vitest'
import { previewPlainMd } from './export'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

const base = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...DEFAULT_SETTINGS, ...patch })
const doc = 'C:\\notes\\我的笔记\\我的笔记.md'

function run(text: string, patch: Partial<AppSettings> = {}): string {
  return previewPlainMd(doc, text, base(patch)).output
}

function reasons(text: string, patch: Partial<AppSettings> = {}): string[] {
  return previewPlainMd(doc, text, base(patch)).removals.map((r) => r.reason)
}

describe('portable markdown export', () => {
  describe('removes what would break on another machine', () => {
    it('strips a relative image link', () => {
      const out = run('before\n![图](./我的笔记_img/a.png)\nafter')
      expect(out).not.toContain('我的笔记_img/a.png')
      expect(out).toContain('before')
      expect(out).toContain('after')
    })

    it('strips an absolute windows image path', () => {
      const src = '![本地](C:\\Users\\me\\Pictures\\a.png)'
      expect(run(src)).not.toContain('C:\\Users')
    })

    it('keeps the link text but drops a local file link', () => {
      const out = run('见 [设计文档](D:/work/spec.md) 那篇')
      expect(out).toContain('设计文档')
      expect(out).not.toContain('D:/work/spec.md')
    })

    it('drops an img tag pointing at file://', () => {
      const out = run('<img src="file:///C:/a.png" width="600">')
      expect(out).not.toContain('file://')
    })

    it('removes our own inline markers', () => {
      const out = run('正文 <!-- mdview:cursor=42 --> 后续')
      expect(out).not.toContain('mdview:')
      expect(out).toContain('正文')
      expect(out).toContain('后续')
    })

    it('drops the private frontmatter keys and keeps the rest', () => {
      const src = '---\ntitle: 笔记\ntags: [a]\nmdview: { cursor: 10 }\n---\n\n正文'
      const out = run(src)
      expect(out).toContain('title: 笔记')
      expect(out).toContain('tags: [a]')
      expect(out).not.toContain('mdview:')
    })
  })

  describe('keeps what is portable', () => {
    it('leaves a remote image alone', () => {
      const src = '![图](https://example.com/a.png)'
      expect(run(src)).toBe(src)
    })

    it('leaves a data uri alone', () => {
      const src = '![图](data:image/png;base64,AAAA)'
      expect(run(src)).toBe(src)
    })

    it('leaves a relative link to another document — that travels fine', () => {
      const src = '见 [另一篇](./另一篇.md)'
      expect(run(src)).toBe(src)
    })

    it('leaves an anchor link alone', () => {
      const src = '见 [本节](#section)'
      expect(run(src)).toBe(src)
    })
  })

  describe('fenced code is sample text, not structure', () => {
    it('does not rewrite an image link inside a fence', () => {
      const src = '```markdown\n![示例](./assets/example.png)\n```'
      expect(run(src)).toBe(src)
      expect(reasons(src)).toEqual([])
    })

    it('does not rewrite a windows path inside a fence', () => {
      const src = '```\nC:\\Users\\me\\file.txt\n```'
      expect(run(src)).toBe(src)
    })

    it('resumes scrubbing after the fence closes', () => {
      const src = '```\n![inside](./a.png)\n```\n![outside](./b.png)'
      const out = run(src)
      expect(out).toContain('![inside](./a.png)')
      expect(out).not.toContain('b.png')
    })

    it('handles tilde fences too', () => {
      const src = '~~~\n![示例](./a.png)\n~~~'
      expect(run(src)).toBe(src)
    })
  })

  describe('image policy', () => {
    it('replaces the link with an italic alt placeholder by default', () => {
      const out = run('![架构图](./x_img/a.png)', { plainMdImagePolicy: 'alt-placeholder' })
      expect(out).toBe('*[图：架构图]*')
    })

    it('falls back to a bare label when there is no alt', () => {
      const out = run('![](./x_img/a.png)', { plainMdImagePolicy: 'alt-placeholder' })
      expect(out).toBe('*[图片]*')
    })

    it('removes the whole line when the policy says drop', () => {
      const out = run('before\n![图](./x_img/a.png)\nafter', { plainMdImagePolicy: 'drop' })
      expect(out.split('\n')).toEqual(['before', 'after'])
    })

    it('leaves an empty reference when the policy says so', () => {
      const out = run('![图](./x_img/a.png)', { plainMdImagePolicy: 'empty-ref' })
      expect(out).toBe('![]()')
    })

    it('replaces every occurrence on the line, not just the first', () => {
      const out = run('![a](./x_img/a.png) 和 ![b](./x_img/b.png)', {
        plainMdImagePolicy: 'alt-placeholder'
      })
      expect(out).toBe('*[图：a]* 和 *[图：b]*')
    })
  })

  describe('reports what it removed', () => {
    it('records the line number and a reason for each removal', () => {
      const src = 'line one\n![图](./x_img/a.png)\nline three'
      const preview = previewPlainMd(doc, src, base())
      expect(preview.removals).toHaveLength(1)
      expect(preview.removals[0].line).toBe(2)
      expect(preview.removals[0].reason).toContain('图片')
    })

    it('suggests a sibling .plain.md target', () => {
      expect(previewPlainMd(doc, 'x', base()).targetPath).toContain('我的笔记.plain.md')
    })

    it('reports nothing for a document that is already portable', () => {
      const src = '# 标题\n\n正文，含 [外链](https://example.com) 一个。'
      expect(previewPlainMd(doc, src, base()).removals).toEqual([])
    })
  })
})
