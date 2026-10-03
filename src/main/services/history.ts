import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
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
 * Consecutive identical content is skipped, so repeated saves without edits
 * do not add noise to the timeline.
 */
export class HistoryService {
  private readonly root: string
  private readonly pending = new Map<string, Promise<unknown>>()

  constructor(userDataDir: string) {
    this.root = join(userDataDir, 'history')
  }

  private dirFor(docId: string): string {
    return join(this.root, docId)
  }

  private async mutate<T>(docId: string, action: () => Promise<T>): Promise<T> {
    // Autosave and restore can arrive together; one index update must not
    // overwrite the other or race a clear/delete of its blobs.
    const next = (this.pending.get(docId) ?? Promise.resolve()).catch(() => undefined).then(action)
    this.pending.set(docId, next)
    try { return await next }
    finally { if (this.pending.get(docId) === next) this.pending.delete(docId) }
  }

  private async readIndex(docId: string): Promise<Index> {
    try {
      const raw = await fs.readFile(join(this.dirFor(docId), 'index.json'), 'utf8')
      const parsed = JSON.parse(raw) as Index
      const seen = new Set<string>()
      return { revs: (Array.isArray(parsed.revs) ? parsed.revs : []).filter((rev) => {
        if (seen.has(rev.id)) return false
        seen.add(rev.id)
        return true
      }) }
    } catch {
      return { revs: [] }
    }
  }

  private async writeIndex(docId: string, index: Index): Promise<void> {
    const dir = this.dirFor(docId)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'index.tmp'), JSON.stringify(index), 'utf8')
    await fs.rename(join(dir, 'index.tmp'), join(dir, 'index.json'))
  }

  /**
   * Record a snapshot. Returns the revision, or null when the content is
   * identical to the newest one — a no-op save should not litter the list.
   */
  record(
    docId: string, text: string, kind: Revision['kind'], opts: { minGapMs?: number } = {}
  ): Promise<Revision | null> {
    return this.mutate(docId, () => this.recordSnapshot(docId, text, kind, opts))
  }

  private async recordSnapshot(
    docId: string,
    text: string,
    kind: Revision['kind'],
    opts: { minGapMs?: number } = {}
  ): Promise<Revision | null> {
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 20)
    const dir = this.dirFor(docId)
    await fs.mkdir(dir, { recursive: true })

    const index = await this.readIndex(docId)
    const newest = index.revs[0]
    if (newest && newest.id.split('-')[0] === hash) return null

    // Throttle autosave snapshots: a burst of typing should leave a few
    // restore points, not one per keystroke pause.
    const gap = opts.minGapMs ?? 0
    if (gap > 0 && newest && kind === 'auto' && Date.now() - newest.at < gap) {
      return null
    }

    // The same content can recur after an undo/restore. Each occurrence needs
    // its own identity; old hash-only revision files remain readable.
    const id = `${hash}-${randomUUID()}`
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
  forget(docId: string, revId: string): Promise<boolean> {
    return this.mutate(docId, () => this.forgetSnapshot(docId, revId))
  }

  private async forgetSnapshot(docId: string, revId: string): Promise<boolean> {
    const index = await this.readIndex(docId)
    const before = index.revs.length
    index.revs = index.revs.filter((r) => r.id !== revId)
    if (index.revs.length === before) return false
    await this.writeIndex(docId, index)
    await fs.rm(join(this.dirFor(docId), `${revId}.md`), { force: true })
    return true
  }

  clear(docId: string): Promise<void> {
    return this.mutate(docId, () => fs.rm(this.dirFor(docId), { recursive: true, force: true }))
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

  const spans: { from: number; to: number }[] = []
  diff.forEach((line, at) => {
    if (line.kind === 'same') return
    const from = Math.max(0, at - context)
    const to = Math.min(diff.length, at + context + 1)
    const previous = spans[spans.length - 1]
    if (previous && from <= previous.to) previous.to = to
    else spans.push({ from, to })
  })
  const hunks = spans.map(({ from, to }) => diff.slice(from, to))

  return { added, removed, hunks }
}
