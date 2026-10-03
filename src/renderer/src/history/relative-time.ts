/** Short weekdays, indexed by `Date.getDay()`. */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))

function clock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dayStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Relative timestamps for the history list.
 *
 * The recent past is relative because that is how people think about their own
 * edits a minute ago; anything older than a day is named by the calendar,
 * because "27 小时前" makes the reader do arithmetic that a date does not.
 */
export function relativeTime(at: number, now = Date.now()): string {
  const diff = now - at
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`

  const d = new Date(at)
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000)
  if (days === 1) return `昨天 ${clock(d)}`
  if (days === 2) return `前天 ${clock(d)}`
  if (days < 7) return `${WEEKDAYS[d.getDay()]} ${clock(d)}`
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${clock(d)}`
  }
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** Full timestamp for the `title` attribute — the relative form is lossy. */
export function absoluteTime(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock(d)}`
}
