import { describe, expect, it } from 'vitest'
import { countLines, formatBytes, formatDelta, kindLabel, lineDelta } from './history-format'

describe('formatBytes', () => {
  it('keeps exact bytes below a kilobyte', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('switches to KB at 1024', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('uses one decimal below ten and rounds above it', () => {
    expect(formatBytes(9_900)).toBe('9.7 KB')
    expect(formatBytes(50_000)).toBe('49 KB')
  })

  it('climbs units without a distracting decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })
})

describe('countLines', () => {
  it('treats an empty document as no lines', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('one')).toBe(1)
    expect(countLines('a\nb')).toBe(2)
  })

  it('counts a trailing newline as its own line', () => {
    expect(countLines('a\n')).toBe(2)
  })
})

describe('lineDelta', () => {
  it('reports growth as a positive delta', () => {
    expect(lineDelta('a\nb', 'a\nb\nc\nd')).toEqual({ before: 2, after: 4, delta: 2 })
  })

  it('reports shrinkage as a negative delta', () => {
    expect(lineDelta('a\nb\nc', 'a')).toEqual({ before: 3, after: 1, delta: -2 })
  })

  it('reports no change when only the text differs', () => {
    expect(lineDelta('a\nb', 'x\ny')).toEqual({ before: 2, after: 2, delta: 0 })
  })

  it('measures the first revision against an empty document', () => {
    expect(lineDelta('', 'a\nb\nc')).toEqual({ before: 0, after: 3, delta: 3 })
  })
})

describe('formatDelta', () => {
  it('labels each direction', () => {
    expect(formatDelta(12)).toBe('+12 行')
    expect(formatDelta(-3)).toBe('−3 行')
    expect(formatDelta(0)).toBe('行数不变')
  })
})

describe('kindLabel', () => {
  it('names every kind in Chinese', () => {
    expect(kindLabel('auto')).toBe('自动')
    expect(kindLabel('manual')).toBe('手动')
    expect(kindLabel('restore')).toBe('还原')
  })
})
