import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { diffLines, HistoryService, summarise } from './history'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'mdview-hist-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const svc = (): HistoryService => new HistoryService(root)

describe('HistoryService', () => {
  it('reads legacy hash-only snapshots and removes ambiguous duplicate identities', async () => {
    const h = svc()
    const id = createHash('sha256').update('legacy').digest('hex').slice(0, 20)
    const dir = join(root, 'history', 'doc1')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, `${id}.md`), 'legacy')
    const revision = { id, at: 1, bytes: 6, kind: 'manual' }
    await fs.writeFile(join(dir, 'index.json'), JSON.stringify({ revs: [revision, revision] }))
    expect(await h.read('doc1', id)).toBe('legacy')
    expect(await h.list('doc1')).toEqual([{ ...revision, lines: 1 }])
    expect(await h.record('doc1', 'legacy', 'manual')).toBeNull()
  })
  it('records a revision and reads it back', async () => {
    const h = svc()
    const rev = await h.record('doc1', 'hello', 'manual')
    expect(rev).not.toBeNull()
    expect(await h.read('doc1', rev!.id)).toBe('hello')
    expect((await h.list('doc1')).length).toBe(1)
  })

  it('lists line counts without rereading new snapshot blobs', async () => {
    const h = svc()
    await h.record('doc1', '', 'manual')
    await h.record('doc1', 'one\ntwo\n', 'manual')
    const read = vi.spyOn(h, 'read')
    expect((await h.list('doc1')).map(rev => rev.lines)).toEqual([3, 0])
    expect(read).not.toHaveBeenCalled()
  })

  it('keeps revisions newest first', async () => {
    const h = svc()
    await h.record('doc1', 'one', 'manual')
    await new Promise((r) => setTimeout(r, 5))
    await h.record('doc1', 'two', 'manual')
    const list = await h.list('doc1')
    expect(list[0].bytes).toBe(3)
    expect(list[1].bytes).toBe(3)
    expect(list[0].at).toBeGreaterThanOrEqual(list[1].at)
  })

  it('ignores a save that changes nothing', async () => {
    const h = svc()
    expect(await h.record('doc1', 'same', 'manual')).not.toBeNull()
    expect(await h.record('doc1', 'same', 'manual')).toBeNull()
    expect((await h.list('doc1')).length).toBe(1)
  })

  it('keeps revisions independent across documents with identical content', async () => {
    const h = svc()
    const a = await h.record('doc1', 'shared text', 'manual')
    const b = await h.record('doc2', 'shared text', 'manual')
    expect(a!.id).not.toBe(b!.id)
    expect(await h.read('doc1', a!.id)).toBe('shared text')
    expect(await h.read('doc2', b!.id)).toBe('shared text')
  })

  it('keeps recurring content as separate restore points and serializes simultaneous writes', async () => {
    const h = svc()
    const [first, second, repeated] = await Promise.all([
      h.record('doc1', 'A', 'manual'),
      h.record('doc1', 'B', 'manual'),
      h.record('doc1', 'A', 'restore')
    ])
    expect((await h.list('doc1')).map((r) => r.id)).toEqual([repeated!.id, second!.id, first!.id])
    expect(repeated!.id).not.toBe(first!.id)
    await h.forget('doc1', repeated!.id)
    expect(await h.read('doc1', first!.id)).toBe('A')
    await Promise.all([h.clear('doc1'), h.record('doc1', 'after clear', 'manual')])
    expect((await h.list('doc1')).length).toBe(1)
  })

  it('throttles consecutive autosave snapshots', async () => {
    const h = svc()
    await h.record('doc1', 'first', 'auto', { minGapMs: 10_000 })
    const second = await h.record('doc1', 'second', 'auto', { minGapMs: 10_000 })
    expect(second).toBeNull()
    expect((await h.list('doc1')).length).toBe(1)
  })

  it('does not throttle a manual snapshot', async () => {
    const h = svc()
    await h.record('doc1', 'first', 'auto', { minGapMs: 10_000 })
    expect(await h.record('doc1', 'second', 'manual', { minGapMs: 10_000 })).not.toBeNull()
    expect((await h.list('doc1')).length).toBe(2)
  })

  it('forgets one revision and its blob', async () => {
    const h = svc()
    const rev = await h.record('doc1', 'gone', 'manual')
    expect(await h.forget('doc1', rev!.id)).toBe(true)
    expect(await h.read('doc1', rev!.id)).toBeNull()
    expect((await h.list('doc1')).length).toBe(0)
  })

  it('reports when forgetting something that is not there', async () => {
    expect(await svc().forget('doc1', 'nope')).toBe(false)
  })

  it('clears a document entirely', async () => {
    const h = svc()
    await h.record('doc1', 'a', 'manual')
    await h.clear('doc1')
    expect((await h.list('doc1')).length).toBe(0)
  })

  it('returns an empty list for an unknown document', async () => {
    expect(await svc().list('never-seen')).toEqual([])
    expect(await svc().read('never-seen', 'x')).toBeNull()
  })

  it('caps the list and drops the oldest blobs', async () => {
    const h = svc()
    const ids: string[] = []
    for (let i = 0; i < 205; i++) {
      const rev = await h.record('doc1', `content ${i}`, 'manual')
      if (rev) ids.push(rev.id)
    }
    const list = await h.list('doc1')
    expect(list.length).toBe(200)

    const kept = new Set(list.map((r) => r.id))
    // The newest survive; the first five are gone, blobs included.
    expect(kept.has(ids[0])).toBe(false)
    expect(kept.has(ids[204])).toBe(true)
    expect(await h.read('doc1', ids[0])).toBeNull()
    expect(await h.read('doc1', ids[204])).toBe('content 204')
  })
})

describe('diffLines', () => {
  it('handles a small edit in a very large document without a quadratic table', () => {
    const lines = Array.from({ length: 20000 }, (_, i) => `line ${i}`)
    const before = lines.join('\n')
    lines[10000] = 'edited'
    const result = diffLines(before, lines.join('\n'))
    expect(result.filter(line => line.kind !== 'same')).toEqual([
      { kind: 'del', text: 'line 10000', oldLine: 10001, newLine: null },
      { kind: 'add', text: 'edited', oldLine: null, newLine: 10001 }
    ])
  })

  it('keeps exact minimal differences and offsets with repeated and reordered lines', () => {
    const samples = ['a', 'b', 'a\na', 'a\nb', 'b\na', 'a\nb\na', 'b\na\nb', '', '\na\n', 'c\nb\na\nc']
    for (const before of samples) for (const after of samples) {
      const a = before.split('\n'), b = after.split('\n')
      const lcs = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
      for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? 1 + lcs[i + 1][j + 1] : Math.max(lcs[i + 1][j], lcs[i][j + 1])
      }
      const result = diffLines(before, after)
      expect(result.filter(line => line.kind !== 'add').map(line => line.text).join('\n')).toBe(before)
      expect(result.filter(line => line.kind !== 'del').map(line => line.text).join('\n')).toBe(after)
      expect(result.filter(line => line.kind === 'same')).toHaveLength(lcs[0][0])
      for (const line of result) {
        if (line.oldLine !== null) expect(a[line.oldLine - 1]).toBe(line.text)
        if (line.newLine !== null) expect(b[line.newLine - 1]).toBe(line.text)
      }
    }
  })
  it('reports no changes for identical text', () => {
    const d = diffLines('a\nb', 'a\nb')
    expect(d.every((l) => l.kind === 'same')).toBe(true)
  })

  it('marks an appended line as an addition', () => {
    const d = diffLines('a', 'a\nb')
    expect(d.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['b'])
  })

  it('marks a removed line as a deletion', () => {
    const d = diffLines('a\nb', 'a')
    expect(d.filter((l) => l.kind === 'del').map((l) => l.text)).toEqual(['b'])
  })

  it('tracks line numbers on both sides', () => {
    const d = diffLines('a\nb\nc', 'a\nx\nc')
    const del = d.find((l) => l.kind === 'del')
    const add = d.find((l) => l.kind === 'add')
    expect(del).toMatchObject({ text: 'b', oldLine: 2, newLine: null })
    expect(add).toMatchObject({ text: 'x', oldLine: null, newLine: 2 })
  })

  it('survives a change at the very start', () => {
    const d = diffLines('old\nkeep', 'new\nkeep')
    expect(d.filter((l) => l.kind === 'same').map((l) => l.text)).toEqual(['keep'])
  })

  it('handles an empty document', () => {
    expect(diffLines('', 'new').some((l) => l.kind === 'add')).toBe(true)
  })

  it('reconstructs the new text from the diff', () => {
    const before = 'a\nb\nc\nd'
    const after = 'a\nX\nc\nd\ne'
    const rebuilt = diffLines(before, after)
      .filter((l) => l.kind !== 'del')
      .map((l) => l.text)
      .join('\n')
    expect(rebuilt).toBe(after)
  })
})

describe('summarise', () => {
  it('keeps context in order without duplicating or dropping distant changes', () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const after = before.replace('line 1\n', 'changed 1\n').replace('line 25\n', 'changed 25\n')
    const result = summarise(diffLines(before, after), 2)
    expect(result.hunks).toHaveLength(2)
    expect(result.hunks[0].filter((line) => line.kind === 'same').map((line) => line.text)).toEqual(['line 0', 'line 2', 'line 3'])
    expect(result.hunks.flat().filter((line) => line.kind === 'add').map((line) => line.text)).toEqual(['changed 1', 'changed 25'])
  })
  it('counts additions and deletions', () => {
    const s = summarise(diffLines('a\nb', 'a\nc\nd'))
    expect(s.added).toBe(2)
    expect(s.removed).toBe(1)
  })

  it('reports no hunks for identical text', () => {
    expect(summarise(diffLines('a\nb', 'a\nb')).hunks).toEqual([])
  })

  it('keeps a changed line inside a hunk', () => {
    const s = summarise(diffLines('a\nb\nc', 'a\nX\nc'))
    const flat = s.hunks.flat()
    expect(flat.some((l) => l.kind === 'del' && l.text === 'b')).toBe(true)
    expect(flat.some((l) => l.kind === 'add' && l.text === 'X')).toBe(true)
  })
})
