import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { DiffLine, DiffSummary, Revision } from '@shared/types'

interface Index {
  revs: Revision[]
}

/**
 * Per-document revision history.
 *
 * Snapshots live under the app's userData rather than beside the document.
 * That keeps a shared folder clean — nobody wants to hand someone a notes
 * folder and have them find a `.history` directory in it — and it means
 * history is never mistaken for content.
 *
 * Identical content is stored once, so a document that is saved repeatedly
 * without changing costs nothing and the list stays readable.
 */
export class HistoryService {
  private readonly root: string

  constructor(userDataDir: string) {
    this.root = join(userDataDir, 'history')
  }

  private dirFor(docId: string): string {
    return join(this.root, docId)
  }

  private async readIndex(docId: string): Promise<Index> {
    try {
      const raw = await fs.readFile(join(this.dirFor(docId), 'index.json'), 'utf8')
      const parsed = JSON.parse(raw) as Index
      return Array.isArray(parsed.revs) ? parsed : { revs: [] }
    } catch {
      return { revs: [] }
    }
  }

  private async writeIndex(docId: string, index: Index): Promise<void> {
    const dir = this.dirFor(docId)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'index.json'), JSON.stringify(index), 'utf8')
  }

  /**
   * Record a snapshot. Returns the revision, or null when the content is
   * identical to the newest one — a no-op save should not litter the list.
   */
  async record(
    docId: string,
    text: string,
    kind: Revision['kind'],
    opts: { minGapMs?: number } = {}
  ): Promise<Revision | null> {
    const id = createHash('sha256').update(text).digest('hex').slice(0, 20)
    const dir = this.dirFor(docId)
    await fs.mkdir(dir, { recursive: true })

    const index = await this.readIndex(docId)
    const newest = index.revs[0]
    if (newest && newest.id === id) return null

    // Throttle autosave snapshots: a burst of typing should leave a few
    // restore points, not one per keystroke pause.
    const gap = opts.minGapMs ?? 0
    if (gap > 0 && newest && kind === 'auto' && Date.now() - newest.at < gap) {
      return null
    }

    await fs.writeFile(join(dir, `${id}.md`), text, 'utf8')
    const rev: Revision = { id, at: Date.now(), bytes: Buffer.byteLength(text), kind }
    index.revs.unshift(rev)

    // Keep the list bounded. Losing a very old revision beats an unbounded
    // directory, and the newest ones are the ones anyone reaches for.
    const MAX = 200
    const dropped = index.revs.splice(MAX)
    for (const old of dropped) {
      // A blob may still be referenced by an older index entry after a
      // restore; check before unlinking rather than assuming.
      if (!index.revs.some((r) => r.id === old.id)) {
        await fs.rm(join(dir, `${old.id}.md`), { force: true })
      }
    }

    await this.writeIndex(docId, index)
    return rev
  }

  async list(docId: string): Promise<Revision[]> {
    return (await this.readIndex(docId)).revs
  }

  /** Revision contents, or null when the blob is gone. */
  async read(docId: string, revId: string): Promise<string | null> {
    try {
      return await fs.readFile(join(this.dirFor(docId), `${revId}.md`), 'utf8')
    } catch {
      return null
    }
  }

  /** Forget one revision, and its blob when nothing else points at it. */
  async forget(docId: string, revId: string): Promise<boolean> {
    const index = await this.readIndex(docId)
    const before = index.revs.length
    index.revs = index.revs.filter((r) => r.id !== revId)
    if (index.revs.length === before) return false
    await this.writeIndex(docId, index)
    await fs.rm(join(this.dirFor(docId), `${revId}.md`), { force: true })
    return true
  }

  async clear(docId: string): Promise<void> {
    await fs.rm(this.dirFor(docId), { recursive: true, force: true })
  }
}

/**
 * Line-level diff between two revisions, computed once per comparison.
 *
 * A plain longest-common-subsequence over lines. Histories here are a few
 * hundred lines, so the quadratic table is cheap and the output is exact —
 * a heuristic would be faster and wrong more often than it is worth.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length

  // lcs[i][j] = length of the common subsequence of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i], oldLine: i + 1, newLine: j + 1 })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'del', text: a[i], oldLine: i + 1, newLine: null })
      i++
    } else {
      out.push({ kind: 'add', text: b[j], oldLine: null, newLine: j + 1 })
      j++
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i], oldLine: ++i, newLine: null })
  while (j < m) out.push({ kind: 'add', text: b[j], oldLine: null, newLine: ++j })
  return out
}

/** Group a diff into hunks with a little unchanged context around each run. */
export function summarise(diff: DiffLine[], context = 3): DiffSummary {
  const added = diff.filter((d) => d.kind === 'add').length
  const removed = diff.filter((d) => d.kind === 'del').length

  const hunks: DiffLine[][] = []
  let current: DiffLine[] = []
  let run = 0

  for (const line of diff) {
    if (line.kind === 'same') {
      run++
      if (current.length > 0 && run > context * 2) {
        current.push(...Array.from({ length: context }, () => line))
        hunks.push(current)
        current = []
        run = 0
      } else if (current.length > 0) {
        current.push(line)
      }
    } else {
      if (current.length === 0) {
        // Open the hunk with the preceding unchanged lines for orientation.
        const at = diff.indexOf(line)
        current.push(...diff.slice(Math.max(0, at - context), at))
      }
      current.push(line)
      run = 0
    }
  }
  if (current.some((l) => l.kind !== 'same')) hunks.push(current)

  return { added, removed, hunks }
}
