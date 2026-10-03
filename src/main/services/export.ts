import { basename, dirname, join } from 'node:path'
import { isPortableLink } from './paths'
import type { AppSettings, ExportMode, ExportPreview } from '@shared/types'

interface Removal {
  line: number
  text: string
  reason: string
}

/**
 * Strip everything that would break the document on someone else's machine:
 * image refs, absolute paths, local-only HTML media, and our own markers.
 *
 * Deliberately line-by-line rather than a markdown AST round-trip — a rewrite
 * through a renderer would reflow the author's formatting and lose intent.
 */
export function previewPlainMd(
  docPath: string,
  text: string,
  settings: AppSettings,
  mode: ExportMode = 'plain-md'
): ExportPreview {
  const lines = text.split(/\r?\n/)
  const removals: Removal[] = []
  const kept: string[] = []

  const policy = settings.plainMdImagePolicy
  let inFrontmatter = false
  let frontmatterDone = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1
    const trimmed = line.trim()

    // Frontmatter block at the very top: drop mdview-private keys, keep the rest.
    if (!frontmatterDone && trimmed === '---' && (i === 0 || frontmatterDone === false)) {
      if (i === 0) {
        inFrontmatter = true
        kept.push(line)
        continue
      }
    }
    if (inFrontmatter) {
      if (trimmed === '---') {
        inFrontmatter = false
        frontmatterDone = true
        kept.push(line)
        continue
      }
      if (/^mdview:/i.test(trimmed)) {
        removals.push({ line: lineNo, text: line, reason: '本地私有状态' })
        continue
      }
      kept.push(line)
      continue
    }

    // Our own inline markers.
    if (/<!--\s*mdview:[\s\S]*?-->/i.test(line)) {
      const stripped = line.replace(/<!--\s*mdview:[\s\S]*?-->/gi, '').trimEnd()
      removals.push({ line: lineNo, text: line, reason: '编辑器标记' })
      if (stripped) kept.push(stripped)
      continue
    }

    // Local HTML media — video/audio/iframe pointing at a file on this disk.
    if (/<(video|audio|source|iframe)\b/i.test(line)) {
      const src = /src=["']([^"']+)["']/i.exec(line)?.[1]
      if (!src || !isPortableLink(src)) {
        removals.push({ line: lineNo, text: line, reason: '本地媒体引用' })
        continue
      }
    }

    // Markdown images.
    const imgLink = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/.exec(line)
    if (imgLink) {
      if (policy === 'drop') {
        removals.push({ line: lineNo, text: line, reason: '图片引用' })
        continue
      }
      const alt = imgLink[1]
      const replacement =
        policy === 'alt-placeholder' ? (alt ? `*[图：${alt}]*` : '*[图片]*') : '![]()'
      const next = line.split(imgLink[0]).join(replacement)
      removals.push({ line: lineNo, text: line, reason: '图片引用（改为占位）' })
      kept.push(next)
      continue
    }

    // HTML <img> tags: drop entirely when they carry a local path.
    if (/<img\b/i.test(line)) {
      const src = /src=["']([^"']+)["']/i.exec(line)?.[1]
      if (!src || !isPortableLink(src)) {
        removals.push({ line: lineNo, text: line, reason: '本地图片标签' })
        continue
      }
    }

    // Link targets that point at this machine. `./other.md` is fine — portable.
    const linkRe = /\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g
    let mutated = line
    let touched = false
    for (const m of line.matchAll(linkRe)) {
      const target = m[2]
      if (target.startsWith('#')) continue
      if (isPortableLink(target)) continue
      mutated = mutated.split(m[0]).join(m[1])
      touched = true
    }
    if (touched) {
      removals.push({ line: lineNo, text: line, reason: '本地绝对路径' })
      kept.push(mutated)
      continue
    }

    // Bare absolute paths left in prose or fenced text.
    if (/[A-Za-z]:\\\\?[^ \n]*\\/i.test(line) || /file:\/\/\//i.test(line)) {
      removals.push({ line: lineNo, text: line, reason: '本地路径' })
      kept.push(line.replace(/file:\/\/\/\S+/gi, '').replace(/[A-Za-z]:\\(?:[^\\\s]+\\)+/g, ''))
      continue
    }

    kept.push(line)
  }

  const stem = basename(docPath).replace(/\.(md|markdown|mdx)$/i, '')
  return {
    mode,
    removals,
    output: kept.join('\n'),
    targetPath: join(dirname(docPath), `${stem}.plain.md`)
  }
}
