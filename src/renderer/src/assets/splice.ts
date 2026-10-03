/**
 * Offset arithmetic for inserting into a document.
 *
 * Every image insertion mutates three things at once — the text, the caret and
 * the blank-line padding — and each one shifts the other two. Routing all of it
 * through one splice keeps the three consistent, which is where hand-written
 * slice arithmetic normally comes apart.
 */

export interface SpliceResult {
  text: string
  /** Offset just past the inserted text, before any padding was added. */
  cursor: number
}

/** Remove `remove` characters at `at` and insert `insert` in their place. */
export function splice(text: string, at: number, remove: number, insert: string): SpliceResult {
  const from = Math.min(Math.max(at, 0), text.length)
  const to = Math.min(Math.max(from + remove, from), text.length)
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    cursor: from + insert.length
  }
}
