import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isDocumentFolder, mapImageLinks, planOrganize, runOrganize } from './organize'

let root: string
let trashed: string[]
const trash = async (path: string): Promise<void> => {
  trashed.push(path)
  await fs.rm(path, { recursive: true })
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'mdview-organize-'))
  trashed = []
})
afterEach(() => fs.rm(root, { recursive: true, force: true }))

async function loose(): Promise<{ doc: string; text: string; elsewhere: string }> {
  const elsewhere = join(root, 'elsewhere', 'shot.png')
  await fs.mkdir(join(root, 'elsewhere'))
  await fs.mkdir(join(root, 'inbox', '报告_img'), { recursive: true })
  await fs.mkdir(join(root, 'inbox', 'pics'))
  await fs.writeFile(elsewhere, 'far')
  await fs.writeFile(join(root, 'inbox', '报告_img', 'a b.png'), 'near')
  await fs.writeFile(join(root, 'inbox', 'pics', 'shot.png'), 'same name, different image')
  const text = [
    '# 报告',
    '![近](./报告_img/a%20b.png "标题") 和 ![远](' + elsewhere.split('\\').join('/') + ')',
    '<img src="pics/shot.png" width="40">',
    '![网](https://example.com/x.png) ![丢](./gone.png) ![内嵌](data:image/png;base64,AAAA)',
    '行内 `![例](./报告_img/a%20b.png)` 不动',
    '```md',
    '![例](./报告_img/a%20b.png)',
    '```'
  ].join('\n')
  const doc = join(root, 'inbox', '报告.md')
  await fs.writeFile(doc, text)
  return { doc, text, elsewhere }
}

describe('mapImageLinks', () => {
  it('skips fences that are closed by a longer or different marker correctly', () => {
    const text = '````\n```\n![a](x.png)\n````\n~~~\n![b](y.png)\n~~~\n![c](z.png)'
    const seen: string[] = []
    mapImageLinks(text, (target) => (seen.push(target), null))
    expect(seen).toEqual(['z.png'])
  })
})

describe('organize', () => {
  it('plans without touching the disk', async () => {
    const { doc, text } = await loose()
    const plan = await planOrganize(doc, text)
    expect(plan.blocked).toBeNull()
    expect(plan.images.map((i) => i.name)).toEqual(['a b.png', 'shot.png', 'shot-2.png'])
    expect(plan.remote).toEqual(['https://example.com/x.png'])
    expect(plan.missing).toEqual(['./gone.png'])
    await expect(fs.access(plan.targetDir)).rejects.toThrow()
  })

  it('copies every image in and rewrites only real links', async () => {
    const { doc, text } = await loose()
    const result = await runOrganize(doc, text, { move: false, download: false }, trash)
    expect(result.docPath).toBe(join(root, 'inbox', '报告', '报告.md'))
    expect(isDocumentFolder(result.docPath)).toBe(true)

    const out = (await fs.readFile(result.docPath, 'utf8')).split('\n')
    expect(out[1]).toBe('![近](./报告_img/a%20b.png "标题") 和 ![远](./报告_img/shot.png)')
    expect(out[2]).toBe('<img src="./报告_img/shot-2.png" width="40">')
    expect(out.slice(3)).toEqual(text.split('\n').slice(3))

    const assets = join(root, 'inbox', '报告', '报告_img')
    expect(await fs.readFile(join(assets, 'shot.png'), 'utf8')).toBe('far')
    expect(await fs.readFile(join(assets, 'shot-2.png'), 'utf8')).toBe('same name, different image')
    expect(await fs.readFile(doc, 'utf8')).toBe(text)
    expect(trashed).toEqual([])
  })

  it('moving bins the original and an asset folder with nothing left in it', async () => {
    const { doc, text, elsewhere } = await loose()
    await runOrganize(doc, text, { move: true, download: false }, trash)
    expect(trashed).toEqual([doc, join(root, 'inbox', '报告_img')])
    await fs.access(elsewhere)
    await fs.access(join(root, 'inbox', 'pics', 'shot.png'))
  })

  it('moving keeps an old asset folder that still holds unreferenced files', async () => {
    const { doc, text } = await loose()
    await fs.writeFile(join(root, 'inbox', '报告_img', 'unused.png'), 'x')
    await runOrganize(doc, text, { move: true, download: false }, trash)
    expect(trashed).toEqual([doc])
  })

  it('refuses to overwrite an existing folder or redo a finished one', async () => {
    const { doc, text } = await loose()
    await fs.mkdir(join(root, 'inbox', '报告'))
    expect((await planOrganize(doc, text)).blocked).toContain('同名文件夹已存在')
    await expect(runOrganize(doc, text, { move: true, download: false }, trash)).rejects.toThrow('同名文件夹已存在')
    expect(trashed).toEqual([])

    const inside = join(root, 'inbox', '报告', '报告.md')
    await fs.writeFile(inside, '')
    expect((await planOrganize(inside, '')).blocked).toContain('已经在')
  })
})
