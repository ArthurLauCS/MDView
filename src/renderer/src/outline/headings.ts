import { markdownLanguage } from '@codemirror/lang-markdown'
import { frontmatterEnd } from '@shared/markdown/frontmatter'

export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  /** 1-based line number in the source. */
  line: number
  /** Character offset of the heading's first character. */
  offset: number
  /** Unique outline identity; duplicate titles remain separately collapsible. */
  id: string
  /** Actual ancestor count, including documents that skip heading levels. */
  depth: number
}

export function slugify(text: string): string {
  return encodeURIComponent(
    text
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, '-')
      .replace(/[^\p{L}\p{N}\-_]/gu, '')
  )
}

export function extractHeadings(source: string): Heading[] {
  const out: Heading[] = []
  const ancestors: number[] = []
  const ids = new Set<string>()
  let previous = 0
  let line = 1
  const body = frontmatterEnd(source)
  // Share the editor's parser so fenced samples and real headings agree.
  markdownLanguage.parser.parse(source).iterate({ enter(node) {
    const match = /^(ATX|Setext)Heading([1-6])$/.exec(node.name)
    if (!match) return
    if (node.from < body) return false
    const level = Number(match[2]) as Heading['level']
    const raw = source.slice(node.from, node.to)
    const label = match[1] === 'ATX'
      ? raw.replace(/^#{1,6}[ \t]*/, '').replace(/[ \t]+#+[ \t]*$/, '')
      : raw.slice(0, raw.lastIndexOf('\n'))
    const text = stripInline(label).replace(/\s+/g, ' ') || '未命名标题'
    const base = slugify(text)
    let id = base
    for (let suffix = 1; ids.has(id); suffix++) id = `${base}-${suffix}`
    ids.add(id)
    while (ancestors.length && ancestors[ancestors.length - 1] >= level) ancestors.pop()
    line += source.slice(previous, node.from).split('\n').length - 1
    previous = node.from
    out.push({ level, text, line, offset: node.from, id, depth: ancestors.length })
    ancestors.push(level)
    return false
  } })
  return out
}

/** `## **粗体** 标题` should read as `粗体 标题` in the outline. */
function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$2')
    .replace(/==(.*?)==/g, '$2')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/** The heading containing an offset — the section a caret sits in. */
export function headingAt(headings: Heading[], offset: number): Heading | null {
  let found: Heading | null = null
  for (const h of headings) {
    if (h.offset <= offset) found = h
    else break
  }
  return found
}
