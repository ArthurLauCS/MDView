import { t } from '../i18n'
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
  if (diff < 60_000) return t('刚刚')
  if (diff < 3_600_000) return t('{0} 分钟前', Math.floor(diff / 60_000))
  if (diff < 86_400_000) return t('{0} 小时前', Math.floor(diff / 3_600_000))

  const d = new Date(at)
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000)
  if (days === 1) return t('昨天 {0}', clock(d))
  if (days === 2) return t('前天 {0}', clock(d))
  if (days < 7) return `${t(WEEKDAYS[d.getDay()])} ${clock(d)}`
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return t('{0} 月 {1} 日 {2}', d.getMonth() + 1, d.getDate(), clock(d))
  }
  return t('{0} 年 {1} 月 {2} 日', d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** Full timestamp for the `title` attribute — the relative form is lossy. */
export function absoluteTime(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock(d)}`
}
