import { describe, expect, it } from 'vitest'
import { absoluteTime, relativeTime } from './relative-time'

/** Local noon, so a test never straddles a day boundary by accident. */
const noon = (y: number, m: number, d: number): number => new Date(y, m - 1, d, 12, 0, 0).getTime()

const NOW = noon(2026, 5, 20)

describe('relativeTime', () => {
  it('calls anything under a minute just now', () => {
    expect(relativeTime(NOW, NOW)).toBe('刚刚')
    expect(relativeTime(NOW - 59_000, NOW)).toBe('刚刚')
  })

  it('switches to minutes at exactly one minute', () => {
    expect(relativeTime(NOW - 60_000, NOW)).toBe('1 分钟前')
    expect(relativeTime(NOW - 59 * 60_000, NOW)).toBe('59 分钟前')
  })

  it('switches to hours at exactly one hour', () => {
    expect(relativeTime(NOW - 3_600_000, NOW)).toBe('1 小时前')
    expect(relativeTime(NOW - 23 * 3_600_000, NOW)).toBe('23 小时前')
  })

  it('says yesterday once the calendar day has turned', () => {
    expect(relativeTime(noon(2026, 5, 19), NOW)).toBe('昨天 12:00')
    expect(relativeTime(noon(2026, 5, 18), NOW)).toBe('前天 12:00')
  })

  it('uses a weekday inside the last week', () => {
    // 2026-05-15 is a Friday.
    expect(relativeTime(noon(2026, 5, 15), NOW)).toBe('周五 12:00')
    expect(relativeTime(noon(2026, 5, 14), NOW)).toBe('周四 12:00')
  })

  it('falls back to a month and day past a week', () => {
    expect(relativeTime(noon(2026, 5, 8), NOW)).toBe('5 月 8 日 12:00')
    expect(relativeTime(noon(2026, 5, 8, ), NOW)).not.toBe('8 天前')
  })

  it('omits the time once the year differs', () => {
    expect(relativeTime(noon(2025, 12, 31), NOW)).toBe('2025 年 12 月 31 日')
  })

  it('pads the clock to two digits', () => {
    expect(relativeTime(new Date(2026, 4, 19, 9, 5).getTime(), NOW)).toBe('昨天 09:05')
  })

  it('does not treat a future stamp as negative', () => {
    expect(relativeTime(NOW + 5_000, NOW)).toBe('刚刚')
  })
})

describe('absoluteTime', () => {
  it('formats a full timestamp', () => {
    expect(absoluteTime(new Date(2026, 4, 8, 9, 5).getTime())).toBe('2026-05-08 09:05')
  })
})
