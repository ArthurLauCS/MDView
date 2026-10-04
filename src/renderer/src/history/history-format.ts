import { t } from '../i18n'
import type { Revision } from '@shared/types'

const KINDS: Record<Revision['kind'], string> = {
  get auto() { return t('自动') },
  get manual() { return t('手动') },
  get restore() { return t('还原') }
}

const UNITS = ['B', 'KB', 'MB', 'GB']

/** Byte size at a readable width — the exact count only matters when small. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`
}

export function kindLabel(kind: Revision['kind']): string {
  return KINDS[kind]
}

/** An empty document is 0 lines, not the 1 a naive `split` would report. */
export function countLines(text: string): number {
  return text === '' ? 0 : text.split('\n').length
}

export interface LineDelta {
  before: number
  after: number
  /** Positive when the revision added lines. */
  delta: number
}

/**
 * How much a revision changed, measured in lines.
 *
 * This is deliberately a line count rather than a real diff: the list only
 * needs a magnitude, and computing 200 snapshots against their predecessors
 * with an LCS would make opening the panel quadratic in the document size.
 * Selecting a revision is what pays for the exact answer.
 */
export function lineDelta(before: string, after: string): LineDelta {
  const a = countLines(before)
  const b = countLines(after)
  return { before: a, after: b, delta: b - a }
}

/** `+12 行` / `-3 行` / `行数不变`. */
export function formatDelta(delta: number): string {
  if (delta === 0) return t('行数不变')
  return t('{0}{1} 行', delta > 0 ? '+' : '−', Math.abs(delta))
}
