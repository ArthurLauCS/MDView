import { describe, expect, it } from 'vitest'
import { assetUrlFor, resolveDocumentAssets } from './resolve-assets'

const DIR = 'C:/notes/我的笔记'

const img = (src: string): string => `<p><img src="${src}" alt="x"></p>`
const rendered = (html: string): string => resolveDocumentAssets(html, DIR)

describe('resolveDocumentAssets', () => {
  /** The URL is percent-encoded, so compare against the decoded form. */
  const decode = (html: string): string => decodeURIComponent(html)

  it('rewrites a relative image onto the asset scheme', () => {
    const out = rendered(img('./我的笔记_img/a.svg'))
    expect(out).toContain('mdasset://local/')
    expect(decode(out)).toContain('我的笔记_img/a.svg')
    expect(out).not.toContain('src="./')
  })

  it('resolves against the document folder, not the app', () => {
    const out = rendered(img('./我的笔记_img/a.svg'))
    expect(decode(out)).toContain('C:/notes/我的笔记/我的笔记_img/a.svg')
  })

  it('leaves a remote image untouched', () => {
    const remote = img('https://example.com/a.png')
    expect(rendered(remote)).toBe(remote)
  })

  it('leaves a data uri untouched', () => {
    const inline = img('data:image/png;base64,AAAA')
    expect(rendered(inline)).toBe(inline)
  })

  it('leaves a protocol-relative url untouched', () => {
    const rel = img('//cdn.example.com/a.png')
    expect(rendered(rel)).toBe(rel)
  })

  it('resolves an unquoted-looking absolute windows path', () => {
    const out = rendered(img('C:/pics/a.png'))
    expect(out).toContain('C:/pics/a.png')
    expect(out).not.toContain('notes')
  })

  it('collapses traversal rather than letting it escape upward', () => {
    const out = rendered(img('./sub/../../outside.png'))
    // `..` is resolved, not passed through to the handler.
    expect(out).not.toContain('..')
    expect(out).toContain('outside.png')
  })

  it('keeps a query string attached to the url, not the filename', () => {
    const out = rendered(img('./a.png?v=2'))
    expect(out).toContain('a.png?v=2')
  })

  it('percent-encodes a space in the filename', () => {
    const out = rendered(img('./我的笔记_img/my file.png'))
    expect(out).toContain('my%20file.png')
  })

  it('decodes a path that markdown-it already encoded', () => {
    // markdown-it hands us `%E5%9B%BE_img/a.png`; it must be decoded before
    // joining, or the filename on disk gains a literal percent sign.
    const out = rendered(img('./%E5%9B%BE_img/a.png'))
    expect(decode(out)).toContain('图_img/a.png')
    expect(out).not.toContain('%25E5') // double-encoded
  })

  it('rewrites several images in one fragment', () => {
    const out = rendered(`${img('./a.png')}${img('./b.png')}`)
    expect(out.match(/mdasset:\/\/local\//g)).toHaveLength(2)
  })

  it('returns the html unchanged when there is no document', () => {
    const html = img('./a.png')
    expect(resolveDocumentAssets(html, null)).toBe(html)
  })

  it('leaves a fragment with no images alone', () => {
    const html = '<p>正文没有图片</p>'
    expect(rendered(html)).toBe(html)
  })

  it('survives a malformed percent escape', () => {
    expect(() => rendered(img('./a%ZZ.png'))).not.toThrow()
  })
})

describe('assetUrlFor', () => {
  it('builds the same url the rewriter would', () => {
    expect(decodeURIComponent(assetUrlFor(DIR, './x_img/a.png'))).toContain(
      'C:/notes/我的笔记/x_img/a.png'
    )
  })
})
