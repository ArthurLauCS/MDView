import { t } from '../i18n'
import { dirname, extname, isAbsolute, relative, resolve, sep, posix } from 'node:path'
import type { LinkTarget } from '@shared/types'

export function resolveDocumentLink(docPath: string, href: string): LinkTarget {
  if (/^(https?:|mailto:)/i.test(href)) return { kind: 'external', url: href }
  if (href.startsWith('//')) return { kind: 'external', url: `https:${href}` }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('\\\\')) throw new Error(t('不支持的链接类型'))
  const hash = href.indexOf('#')
  const fragment = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1))
  const path = decodeURIComponent((hash < 0 ? href : href.slice(0, hash)).split('?')[0])
  if (!path) return { kind: 'document', path: docPath, fragment }
  if (!docPath) throw new Error(t('请先保存文档，再打开相对链接'))
  if (!/\.(md|markdown|mdx)$/i.test(extname(path)) || path.includes('\0')) throw new Error(t('只能在应用内打开 Markdown 文档'))
  return { kind: 'document', path: resolve(dirname(docPath), path), fragment }
}

/**
 * The one and only place a markdown image path is produced.
 *
 * Every path written into a document MUST be relative and POSIX-separated,
 * otherwise the folder stops being portable to another machine.
 */
export function buildRelativePath(fromDir: string, toFile: string): string {
  const rel = relative(fromDir, toFile)
  if (isAbsolute(rel)) {
    throw new Error(`refusing to write an absolute asset path: ${rel}`)
  }
  // Windows separators break markdown links on other platforms.
  const posixRel = rel.split(sep).join(posix.sep)
  return posixRel.startsWith('.') ? posixRel : `./${posixRel}`
}

/** True when the text is safe to embed in a markdown link target. */
export function isPortableLink(target: string): boolean {
  if (isAbsolute(target)) return false
  if (/^[a-zA-Z]:[\\/]/.test(target)) return false
  if (target.startsWith('file://')) return false
  if (target.startsWith('\\\\')) return false
  return true
}

const UNRESERVED = /[A-Za-z0-9\-._~!$&'()*+,;=@/]|[^\x00-\x7F]/u

/**
 * Percent-encode only the characters that would break a markdown link.
 * CJK filenames stay readable on purpose — encoded names are unusable.
 */
export function encodeLinkTarget(raw: string): string {
  let out = ''
  for (const ch of raw) {
    out += UNRESERVED.test(ch) ? ch : encodeURIComponent(ch)
  }
  return out
}

/** Resolve an on-disk asset back into a link, encoded and relative. */
export function toLink(editorFilePath: string, assetAbsPath: string): string {
  const fromDir = resolve(editorFilePath, '..')
  return encodeLinkTarget(buildRelativePath(fromDir, assetAbsPath))
}
