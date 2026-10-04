import { t } from '../i18n'
/**
 * Source-level markdown transforms. Every function is pure: it takes the
 * whole document and a selection, and returns the new document plus where
 * the cursor lands. Keeping them free of editor state makes them testable
 * and lets the same op serve a shortcut, a menu item and the palette.
 */

export interface EditResult {
  text: string
  cursor: number
  /** Selection to restore, when the op leaves something selected. */
  selection?: [number, number]
}

/** Expand a range to whole lines, returning the line boundaries. */
function lineBounds(src: string, start: number, end: number): [number, number] {
  const from = src.lastIndexOf('\n', start - 1) + 1
  let to = src.indexOf('\n', end)
  if (to === -1) to = src.length
  return [from, to]
}

export function toggleInline(src: string, start: number, end: number, wrap: string): EditResult {
  const close = wrap === '<u>' ? '</u>' : wrap
  if (start === end) {
    // Nothing selected: insert the pair and put the cursor between them so
    // the next typed character lands inside the emphasis.
    const text = src.slice(0, start) + wrap + close + src.slice(end)
    return { text, cursor: start + wrap.length }
  }
  const selected = src.slice(start, end)
  const before = src.slice(start - wrap.length, start)
  const after = src.slice(end, end + close.length)

  // Already wrapped — unwrap.
  if (before === wrap && after === close) {
    return {
      text: src.slice(0, start - wrap.length) + selected + src.slice(end + close.length),
      cursor: start - wrap.length,
      selection: [start - wrap.length, end - wrap.length]
    }
  }
  // Selection itself contains the markers.
  if (selected.startsWith(wrap) && selected.endsWith(close) && selected.length > wrap.length + close.length) {
    const inner = selected.slice(wrap.length, -close.length)
    return { text: src.slice(0, start) + inner + src.slice(end), cursor: start, selection: [start, start + inner.length] }
  }
  return {
    text: src.slice(0, start) + wrap + selected + close + src.slice(end),
    cursor: start + wrap.length,
    selection: [start + wrap.length, end + wrap.length]
  }
}

/**
 * Toggle a per-line prefix (`> `, `- `, `1. `, `# ` …).
 * If every line already carries it, the prefix is removed instead.
 */
export function toggleLinePrefix(
  src: string,
  start: number,
  end: number,
  prefix: string | ((index: number) => string)
): EditResult {
  const [from, to] = lineBounds(src, start, end)
  const lines = src.slice(from, to).split('\n')
  const resolve = (i: number): string => (typeof prefix === 'function' ? prefix(i) : prefix)
  const has = lines.every((l, i) => l.trimStart().startsWith(resolve(i)))

  const next = lines.map((l, i) => {
    const p = resolve(i)
    if (has) {
      const lead = l.length - l.trimStart().length
      return l.slice(0, lead) + l.trimStart().slice(p.length)
    }
    return p + l
  })

  const joined = next.join('\n')
  return {
    text: src.slice(0, from) + joined + src.slice(to),
    cursor: from,
    selection: [from, from + joined.length]
  }
}

/** Set (or clear with `0`) an ATX heading level on the selected lines. */
export function setHeading(src: string, start: number, end: number, level: number): EditResult {
  const [from, to] = lineBounds(src, start, end)
  const lines = src.slice(from, to).split('\n')
  const next = lines.map((l) => {
    const bare = l.replace(/^\s*#{1,6}\s+/, '')
    return level === 0 ? bare : `${'#'.repeat(level)} ${bare}`
  })
  return { text: src.slice(0, from) + next.join('\n') + src.slice(to), cursor: from }
}

export function insertBlock(src: string, at: number, block: string): EditResult {
  const before = src.slice(0, at)
  const after = src.slice(at)
  // Exactly one blank line on each side — no more, no less.
  const needsBefore = before.length > 0 && !before.endsWith('\n\n')
  const padBefore = needsBefore ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
  const needsAfter = after.length > 0 && !after.startsWith('\n\n')
  const padAfter = needsAfter ? (after.startsWith('\n') ? '\n' : '\n\n') : ''
  const insert = padBefore + block + padAfter
  return { text: before + insert + after, cursor: at + padBefore.length + block.length }
}

/** `**` → `**bold**` etc. The wrapper list defines what the UI can apply. */
export const INLINE_WRAPPERS = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
  mark: '==',
  underline: '<u>'
} as const

export interface PrefixToggle {
  id: string
  prefix: string | ((index: number) => string)
  title: string
}

export const LINE_PREFIXES: PrefixToggle[] = [
  { id: 'quote', prefix: '> ', get title() { return t('引用块') } },
  { id: 'ul', prefix: '- ', get title() { return t('无序列表') } },
  { id: 'ol', prefix: (i) => `${i + 1}. `, get title() { return t('有序列表') } },
  { id: 'task', prefix: '- [ ] ', get title() { return t('任务列表') } }
]

/** Smart continuation: what the next line should start with after Enter. */
export function continuationPrefix(line: string): string | null {
  const task = /^(\s*)- \[[ xX]\] /.exec(line)
  if (task) {
    // An empty task item ends the list rather than spawning another.
    return line.trim() === '- [ ]' ? null : `${task[1]}- [ ] `
  }
  const ul = /^(\s*)([-*+]) /.exec(line)
  if (ul) return line.trim() === ul[2] ? null : `${ul[1]}${ul[2]} `
  const ol = /^(\s*)(\d+)([.)]) /.exec(line)
  if (ol) return line.trim() === `${ol[2]}${ol[3]}` ? null : `${ol[1]}${Number(ol[2]) + 1}${ol[3]} `
  const quote = /^(\s*)> ?/.exec(line)
  if (quote) return line.trim() === '>' ? null : `${quote[1]}> `
  return null
}

const PAIRS: Record<string, string> = {
  '*': '*',
  _: '_',
  '`': '`',
  '~': '~',
  '[': ']',
  '(': ')',
  '{': '}',
  '"': '"',
  "'": "'",
  '“': '”',
  '（': '）',
  '【': '】'
}

/**
 * Decide what a typed character should do, before it reaches the document.
 * Returns null to let the character through unchanged.
 */
export function autoPair(
  src: string,
  cursor: number,
  selection: { start: number; end: number } | null,
  ch: string
): EditResult | 'skip-close' | null {
  // A fence is typed literally. Pairing its backticks leaves an extra closer
  // inside the new block and moves the caret onto a hidden delimiter.
  const lineStart = src.lastIndexOf('\n', cursor - 1) + 1
  const lineEnd = src.indexOf('\n', cursor)
  if (ch === '`' && !selection && /^ {0,3}`*$/.test(src.slice(lineStart, cursor)) &&
    /^`*$/.test(src.slice(cursor, lineEnd < 0 ? src.length : lineEnd))) return null

  // Closing a pair that is already there should step over it, not double it.
  const closer = Object.values(PAIRS).includes(ch) ? ch : null
  if (closer && src[cursor] === closer && (!selection || selection.start === selection.end)) {
    return 'skip-close'
  }

  const open = PAIRS[ch]
  if (!open) return null

  if (selection && selection.start !== selection.end) {
    const inner = src.slice(selection.start, selection.end)
    return {
      text: src.slice(0, selection.start) + ch + inner + open + src.slice(selection.end),
      cursor: selection.start + ch.length,
      selection: [selection.start + ch.length, selection.end + ch.length]
    }
  }

  return { text: src.slice(0, cursor) + ch + open + src.slice(cursor), cursor: cursor + ch.length }
}

/** Fenced code block helper — adds the language slot and places the cursor. */
export function insertCodeBlock(src: string, at: number, lang = ''): EditResult {
  const block = '```' + lang + '\n\n```'
  const res = insertBlock(src, at, block)
  return { text: res.text, cursor: res.cursor - 3 }
}

export function insertTable(src: string, at: number, rows: number, cols: number): EditResult {
  const head = `| ${Array.from({ length: cols }, (_, i) => t('列{0}', i + 1)).join(' | ')} |`
  const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`
  const body = Array.from(
    { length: Math.max(rows - 1, 0) },
    () => `| ${Array.from({ length: cols }, () => '   ').join(' | ')} |`
  )
  const block = [head, sep, ...body].join('\n')
  const res = insertBlock(src, at, block)
  return { text: res.text, cursor: res.cursor - block.length + 2 }
}

/** Strip markdown syntax down to readable plain text — for "copy as text". */
export function toPlainText(md: string): string {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$2')
    .replace(/==(.*?)==/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .trim()
}

/** Normalise whitespace and list markers without touching prose content. */
export function tidyMarkdown(src: string): string {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/^(\s*)[-*+]\s+/gm, '$1- ')
    .replace(/\n+$/, '\n')
}
