import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { planZip, runZip, archiveNameFor } from './archive'
import { buildZip } from './zip'

/**
 * These run against a real folder on disk, not a mock: the mode's entire job
 * is to reproduce a directory's shape, and a mocked fs would let the walk and
 * the entry naming disagree without anything noticing.
 */
let root: string
let docPath: string

async function readZipEntries(buf: Buffer): Promise<Map<string, Buffer>> {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buf.readUInt16LE(endAt + 10)
  let p = buf.readUInt32LE(endAt + 16)
  const out = new Map<string, Buffer>()
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10)
    const compressed = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const localAt = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const start = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28)
    const body = buf.subarray(start, start + compressed)
    out.set(name, method === 8 ? (await import('node:zlib')).inflateRawSync(body) : Buffer.from(body))
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return out
}

describe('zip planning', () => {
  beforeAll(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'mdview-zip-'))
    const docDir = join(root, '我的笔记')
    await fs.mkdir(join(docDir, '我的笔记_img'), { recursive: true })
    await fs.writeFile(join(docDir, '我的笔记.md'), '# 笔记\n\n![图](./我的笔记_img/a.png)\n')
    await fs.writeFile(join(docDir, '我的笔记_img', 'a.png'), 'PNG-BYTES')
    docPath = join(docDir, '我的笔记.md')
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('includes the markdown and its image folder, with relative names', async () => {
    const { entries } = await planZip(docPath)
    const names = entries.map((e) => e.name)
    expect(names).toContain('我的笔记.md')
    expect(names).toContain('我的笔记_img/a.png')
    // Relative, never absolute: that is what keeps the links working.
    expect(names.every((n) => !n.includes(':') && !n.startsWith('/'))).toBe(true)
  })

  it('writes directory entries so empty folders survive', async () => {
    const { entries } = await planZip(docPath)
    const dir = entries.find((e) => e.name === '我的笔记_img/')
    expect(dir?.directory).toBe(true)
  })

  it('includes other markdown in the same folder', async () => {
    await fs.writeFile(join(root, '我的笔记', '另一篇.md'), '# 另一篇\n')
    const { entries } = await planZip(docPath)
    expect(entries.map((e) => e.name)).toContain('另一篇.md')
  })

  it('skips hidden and tool directories, and says so', async () => {
    const docDir = join(root, '我的笔记')
    for (const d of ['.mdview', '.git', 'node_modules']) {
      await fs.mkdir(join(docDir, d), { recursive: true })
      await fs.writeFile(join(docDir, d, 'junk.txt'), 'junk')
    }
    const { entries, skipped } = await planZip(docPath)
    const names = entries.map((e) => e.name)
    expect(names.some((n) => n.includes('.mdview'))).toBe(false)
    expect(names.some((n) => n.includes('.git'))).toBe(false)
    expect(names.some((n) => n.includes('node_modules'))).toBe(false)
    expect(skipped).toHaveLength(3)
    expect(skipped[0].reason).toContain('不属于文档')
  })

  it('produces an archive that reads back with the same bytes', async () => {
    const { archive, entries } = await runZip(docPath)
    const read = await readZipEntries(archive)
    expect([...read.keys()].sort()).toEqual(entries.map((e) => e.name).sort())
    expect(read.get('我的笔记.md')?.toString('utf8')).toContain('# 笔记')
    expect(read.get('我的笔记_img/a.png')?.toString('utf8')).toBe('PNG-BYTES')
  })

  it('names the archive after the document stem', () => {
    expect(archiveNameFor(docPath)).toBe('我的笔记.zip')
  })

  it('builds an archive from an empty plan without throwing', () => {
    expect(buildZip([]).length).toBe(22)
  })
})
