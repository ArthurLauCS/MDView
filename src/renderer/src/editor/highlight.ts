/**
 * Source-view syntax highlighting.
 *
 * This runs on every keystroke, so it is a single left-to-right scan over the
 * text rather than a set of global regex passes. One pass means no regex can
 * rescan text a previous one already wrapped, which is both faster and the
 * only way to keep overlapping constructs from corrupting each other's tags.
 */

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ESCAPE[c])
}

function wrap(cls: string, text: string): string {
  return `<span class="md-tok-${cls}">${esc(text)}</span>`
}

const HEADING_RE = /^(#{1,6})(\s+)(.*)$/
const ULIST_RE = /^(\s*)([-*+])(\s+)(\[[ xX]\]\s+)?(.*)$/
const OLIST_RE = /^(\s*)(\d+[.)])(\s+)(.*)$/
const QUOTE_RE = /^(\s*>+\s?)(.*)$/
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/
const FENCE_RE = /^(\s*)(```|~~~)([^\n]*)$/

export function highlightSource(src: string): string {
  const lines = src.split('\n')
  const out: string[] = []
  let fence: string | null = null

  for (const line of lines) {
    // Inside a fence everything is literal until the matching close.
    if (fence !== null) {
      const close = FENCE_RE.exec(line)
      if (close && close[2].startsWith(fence[0])) {
        out.push(wrap('fence', close[0]))
        fence = null
      } else {
        out.push(wrap('code', line))
      }
      continue
    }

    const open = FENCE_RE.exec(line)
    if (open) {
      const info = open[3]
      out.push(
        wrap('fence', open[1] + open[2]) +
          (info ? wrap('lang', info) : '')
      )
      fence = open[2]
      continue
    }

    if (HR_RE.test(line)) {
      out.push(wrap('hr', line))
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      out.push(
        wrap('heading-marker', heading[1]) +
          heading[2] +
          wrap(`heading-${Math.min(heading[1].length, 6)}`, heading[3])
      )
      continue
    }

    const quote = QUOTE_RE.exec(line)
    if (quote) {
      out.push(wrap('quote-marker', quote[1]) + inline(quote[2]))
      continue
    }

    const task = ULIST_RE.exec(line)
    if (task) {
      out.push(
        task[1] +
          wrap('list-marker', task[2]) +
          task[3] +
          (task[4] ? wrap('task', task[4]) : '') +
          inline(task[5])
      )
      continue
    }

    const ol = OLIST_RE.exec(line)
    if (ol) {
      out.push(ol[1] + wrap('list-marker', ol[2]) + ol[3] + inline(ol[4]))
      continue
    }

    out.push(inline(line))
  }

  return out.join('\n')
}

/**
 * Inline pass. Emphasis, code spans, links and images are scanned in one
 * sweep with a precedence order: code first (it swallows everything), then
 * images, then links, then emphasis.
 */
function inline(text: string): string {
  let i = 0
  let out = ''

  while (i < text.length) {
    const ch = text[i]

    // ---- inline code: highest precedence, runs to the next backtick -------
    if (ch === '`') {
      const run = /^`+/.exec(text.slice(i))?.[0] ?? '`'
      const close = text.indexOf(run, i + run.length)
      if (close !== -1) {
        out += wrap('code-inline', text.slice(i, close + run.length))
        i = close + run.length
        continue
      }
    }

    // ---- images and links -------------------------------------------------
    if (ch === '!' && text[i + 1] === '[') {
      const end = matchLink(text, i + 1)
      if (end !== -1) {
        out +=
          wrap('image-marker', '!') + inlineLink(text.slice(i + 1, end), 'image')
        i = end
        continue
      }
    }
    if (ch === '[') {
      const end = matchLink(text, i)
      if (end !== -1) {
        out += inlineLink(text.slice(i, end), 'link')
        i = end
        continue
      }
    }

    // ---- wikilink ---------------------------------------------------------
    if (ch === '[' && text[i + 1] === '[') {
      const close = text.indexOf(']]', i + 2)
      if (close !== -1) {
        out += wrap('link', text.slice(i, close + 2))
        i = close + 2
        continue
      }
    }

    // ---- strong / emphasis ------------------------------------------------
    const em = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(text.slice(i))
    if (em) {
      out += wrap('strong', em[0])
      i += em[0].length
      continue
    }
    const st = /^(~~)(?=\S)([\s\S]*?\S)\1/.exec(text.slice(i))
    if (st) {
      out += wrap('strike', st[0])
      i += st[0].length
      continue
    }
    const mk = /^(==)(?=\S)([\s\S]*?\S)\1/.exec(text.slice(i))
    if (mk) {
      out += wrap('mark', mk[0])
      i += mk[0].length
      continue
    }
    const it = /^(\*|_)(?=\S)([^*_\n]*?\S)\1/.exec(text.slice(i))
    if (it) {
      out += wrap('emphasis', it[0])
      i += it[0].length
      continue
    }

    // ---- reference / footnote --------------------------------------------
    const fn = /^\[\^[^\]]+\]/.exec(text.slice(i))
    if (fn) {
      out += wrap('footnote', fn[0])
      i += fn[0].length
      continue
    }

    // ---- math -------------------------------------------------------------
    if (ch === '$' && text[i + 1] === '$') {
      const close = text.indexOf('$$', i + 2)
      if (close !== -1) {
        out += wrap('math', text.slice(i, close + 2))
        i = close + 2
        continue
      }
    }

    out += esc(ch)
    i++
  }

  return out
}

/** Index just past a `[...](...)` group starting at `open`, or -1. */
function matchLink(text: string, open: number): number {
  if (text[open] !== '[') return -1
  let depth = 0
  let i = open
  for (; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === '[') depth++
    else if (text[i] === ']') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) return -1
  if (text[i + 1] !== '(') return -1

  let parens = 0
  let j = i + 1
  for (; j < text.length; j++) {
    if (text[j] === '\\') {
      j++
      continue
    }
    if (text[j] === '(') parens++
    else if (text[j] === ')') {
      parens--
      if (parens === 0) return j + 1
    }
  }
  return -1
}

function inlineLink(raw: string, kind: 'link' | 'image'): string {
  const m = /^(\[)([^\]]*)(\])(\()([^)]*)(\))$/.exec(raw)
  if (!m) return wrap(kind, raw)
  return (
    wrap('bracket', m[1]) +
    wrap('link-text', m[2]) +
    wrap('bracket', m[3]) +
    wrap('bracket', m[4]) +
    wrap('link-url', m[5]) +
    wrap('bracket', m[6])
  )
}
