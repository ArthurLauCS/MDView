import { t } from '../i18n'
import { basename, dirname, join } from 'node:path'
import { isPortableLink } from './paths'
import type { AppSettings, ExportMode, ExportPreview } from '@shared/types'

interface Removal {
  line: number
  text: string
  reason: string
}

/** Remote and inline images travel with the document; local ones do not. */
function isPortableImage(target: string): boolean {
  return /^(https?:)?\/\//i.test(target) || target.startsWith('data:')
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
  /** The opening fence token while inside a code block, else null. */
  let fenceLang: string | null = null

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
        removals.push({ line: lineNo, text: line, reason: t('本地私有状态') })
        continue
      }
      kept.push(line)
      continue
    }

    // Fenced content is sample text, not document structure. An image link
    // inside a fence is there to be *read*, so rewriting or removing it would
    // corrupt the example — leave everything between fences untouched.
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      if (fenceLang === null) fenceLang = fence[1]
      else if (fence[1] === fenceLang) fenceLang = null
      kept.push(line)
      continue
    }
    if (fenceLang !== null) {
      kept.push(line)
      continue
    }

    // Our own inline markers.
    if (/<!--\s*mdview:[\s\S]*?-->/i.test(line)) {
      const stripped = line.replace(/<!--\s*mdview:[\s\S]*?-->/gi, '').trimEnd()
      removals.push({ line: lineNo, text: line, reason: t('编辑器标记') })
      if (stripped) kept.push(stripped)
      continue
    }

    // Local HTML media — video/audio/iframe pointing at a file on this disk.
    if (/<(video|audio|source|iframe)\b/i.test(line)) {
      const src = /src=["']([^"']+)["']/i.exec(line)?.[1]
      if (!src || !isPortableLink(src)) {
        removals.push({ line: lineNo, text: line, reason: t('本地媒体引用') })
        continue
      }
    }

    // Markdown images. A line can hold several, and only the ones pointing at
    // this disk are touched — a remote or inline image travels perfectly well.
    const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g
    const imageMatches = [...line.matchAll(IMG_RE)].filter((m) => isPortableImage(m[2]) === false)

    if (imageMatches.length > 0) {
      if (policy === 'drop') {
        // Dropping the line only makes sense when the images are all it holds.
        const onlyImages = line.replace(IMG_RE, '').trim() === ''
        if (onlyImages) {
          removals.push({ line: lineNo, text: line, reason: t('图片引用') })
          continue
        }
      }
      let next = line
      for (const m of imageMatches) {
        const alt = m[1]
        const replacement =
          policy === 'drop'
            ? ''
            : policy === 'alt-placeholder'
              ? alt
                ? t('*[图：{0}]*', alt)
                : t('*[图片]*')
              : '![]()'
        next = next.split(m[0]).join(replacement)
      }
      removals.push({ line: lineNo, text: line, reason: t('本地图片引用') })
      kept.push(next.replace(/ {2,}/g, ' ').trimEnd())
      continue
    }

    // HTML <img> tags: drop entirely when they carry a local path.
    if (/<img\b/i.test(line)) {
      const src = /src=["']([^"']+)["']/i.exec(line)?.[1]
      if (!src || !isPortableLink(src)) {
        removals.push({ line: lineNo, text: line, reason: t('本地图片标签') })
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
      removals.push({ line: lineNo, text: line, reason: t('本地绝对路径') })
      kept.push(mutated)
      continue
    }

    // Bare absolute paths left in prose or fenced text.
    if (/[A-Za-z]:\\\\?[^ \n]*\\/i.test(line) || /file:\/\/\//i.test(line)) {
      removals.push({ line: lineNo, text: line, reason: t('本地路径') })
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
