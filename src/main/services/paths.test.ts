import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { resolveDocumentLink } from './paths'

describe('document link targets', () => {
  const doc = resolve('notes', 'README.md')
  it('resolves relative paths, encoding, queries and fragments against the document', () => {
    expect(resolveDocumentLink(doc, '../%E4%B8%AD%E6%96%87%20file.md?view=1#%E7%AB%A0%E8%8A%82')).toEqual({
      kind: 'document', path: resolve('中文 file.md'), fragment: '章节'
    })
    expect(resolveDocumentLink(doc, '#section')).toEqual({ kind: 'document', path: doc, fragment: 'section' })
    expect(resolveDocumentLink('', '#section')).toEqual({ kind: 'document', path: '', fragment: 'section' })
  })
  it('only allows browser and mail protocols or Markdown files', () => {
    for (const url of ['https://example.com', 'http://example.com', 'mailto:test@example.com']) {
      expect(resolveDocumentLink(doc, url)).toEqual({ kind: 'external', url })
    }
    expect(resolveDocumentLink(doc, '//example.com')).toEqual({ kind: 'external', url: 'https://example.com' })
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///C:/x.md', 'ms-settings:defaultapps', 'cmd.exe', './script.bat', '\\\\host\\a.md']) {
      expect(() => resolveDocumentLink(doc, url)).toThrow()
    }
    expect(() => resolveDocumentLink('', 'README.md')).toThrow()
  })
})
