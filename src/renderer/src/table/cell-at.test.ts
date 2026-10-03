import { describe, expect, it } from 'vitest'
import { cellAt, findTableAt } from './model'

const SRC = ['前言', '| a | b | c |', '| --- | --- | --- |', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |', '结尾'].join('\n')

function at(offset: number): { row: number; col: number } | null {
  const ctx = findTableAt(SRC, offset)
  return ctx ? cellAt(ctx, offset) : null
}

/** Offset of the first character of `needle` in SRC. */
const pos = (needle: string, from = 0): number => SRC.indexOf(needle, from)

describe('cellAt', () => {
  it('maps the header row to row 0', () => {
    expect(at(pos('a') + 1)).toEqual({ row: 0, col: 0 })
    expect(at(pos('b') + 1)).toEqual({ row: 0, col: 1 })
    expect(at(pos('c') + 1)).toEqual({ row: 0, col: 2 })
  })

  it('reports nothing for the delimiter row', () => {
    // The delimiter sits between header and body and is not addressable.
    expect(at(pos('| --- |') + 3)).toBeNull()
  })

  it('maps body rows to 1 and 2', () => {
    expect(at(pos('1') + 0)).toEqual({ row: 1, col: 0 })
    expect(at(pos('4'))).toEqual({ row: 2, col: 0 })
    expect(at(pos('5'))).toEqual({ row: 2, col: 1 })
  })

  it('puts a caret on a separator with the cell it just left', () => {
    const sep = SRC.indexOf(' | ', pos('| 1 |'))
    expect(at(sep)).toEqual({ row: 1, col: 0 })
  })

  it('returns null outside the table', () => {
    expect(at(0)).toBeNull()
    expect(at(SRC.length - 1)).toBeNull()
  })

  it('holds the last cell at the end of a row', () => {
    const end = pos('| 1 |') + '| 1 | 2 | 3 |'.length - 1
    expect(at(end)).toEqual({ row: 1, col: 2 })
  })
})
