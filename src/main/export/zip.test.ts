import { describe, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { buildZip, type ZipEntry } from './zip'

/**
 * The archive is read back by a reader written from the format spec, not by
 * the writer's own helpers — a writer and reader that share a bug would agree
 * with each other and both be wrong.
 */
interface ReadEntry {
  name: string
  flags: number
  method: number
  crc: number
  data: Buffer
}

function readZip(buf: Buffer): ReadEntry[] {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  expect(endAt).toBeGreaterThan(-1)

  const count = buf.readUInt16LE(endAt + 10)
  const centralSize = buf.readUInt32LE(endAt + 12)
  const centralAt = buf.readUInt32LE(endAt + 16)
  expect(centralAt + centralSize).toBe(endAt)

  const out: ReadEntry[] = []
  let p = centralAt

  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50)
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compressed = buf.readUInt32LE(p + 20)
    const uncompressed = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localAt = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')

    // The local header must agree with the central directory, and it must
    // actually sit where the directory says it does.
    expect(buf.readUInt32LE(localAt)).toBe(0x04034b50)
    const localNameLen = buf.readUInt16LE(localAt + 26)
    const localExtraLen = buf.readUInt16LE(localAt + 28)
    expect(buf.readUInt16LE(localAt + 8)).toBe(method)
    expect(buf.readUInt32LE(localAt + 14)).toBe(crc)
    expect(buf.subarray(localAt + 30, localAt + 30 + localNameLen).toString('utf8')).toBe(name)

    const start = localAt + 30 + localNameLen + localExtraLen
    const body = buf.subarray(start, start + compressed)
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body)
    expect(data.length).toBe(uncompressed)

    out.push({ name, flags, method, crc, data })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const entry = (name: string, text: string): ZipEntry => ({ name, data: Buffer.from(text, 'utf8') })

describe('zip writer', () => {
  it('round-trips a single entry', () => {
    const zip = buildZip([entry('a.md', '# 标题')])
    const [read] = readZip(zip)
    expect(read.name).toBe('a.md')
    expect(read.data.toString('utf8')).toBe('# 标题')
  })

  it('preserves a Chinese filename byte for byte', () => {
    const zip = buildZip([entry('发布说明_img/架构草图.png', 'x')])
    const [read] = readZip(zip)
    expect(read.name).toBe('发布说明_img/架构草图.png')
    expect(read.flags & 0x0800).toBe(0x0800)
  })

  it('keeps several entries distinct and ordered', () => {
    const zip = buildZip([
      entry('发布说明.md', 'body'),
      entry('发布说明_img/a.png', 'png'),
      entry('另一篇.md', 'other')
    ])
    const names = readZip(zip).map((e) => e.name)
    expect(names).toEqual(['发布说明.md', '发布说明_img/a.png', '另一篇.md'])
  })

  it('deflates text but stores incompressible bytes', () => {
    const noise = Buffer.from(
      Array.from({ length: 4096 }, () => Math.floor(Math.random() * 256))
    )
    const zip = buildZip([entry('notes.md', 'x'.repeat(4096)), { name: 'noise.bin', data: noise }])
    const read = readZip(zip)
    expect(read[0].method).toBe(8)
    expect(read[1].method).toBe(0)
    expect(read[1].data.equals(noise)).toBe(true)
  })

  it('writes a directory entry that survives as an empty folder', () => {
    const zip = buildZip([{ name: '空文件夹/', data: Buffer.alloc(0), directory: true }])
    const [read] = readZip(zip)
    expect(read.name).toBe('空文件夹/')
    expect(read.data.length).toBe(0)
  })

  it('handles an empty archive', () => {
    expect(readZip(buildZip([]))).toEqual([])
  })

  it('records a crc that matches the uncompressed bytes', () => {
    const zip = buildZip([entry('a.md', 'hello')])
    const [read] = readZip(zip)
    // Independently: crc32('hello') is a known constant.
    expect(read.crc).toBe(0x3610a686)
  })
})
