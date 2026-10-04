import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import matter from 'gray-matter'
import { buildRelativePath, toLink } from './paths'
import { assetDirName, docIdFor } from './workspace'
import { isDocumentFolder } from './organize'
import type { DocumentContent, DocumentMeta } from '@shared/types'
import { t } from '../i18n'

export class DocumentService {
  private pending = new Map<string, Promise<void>>()
  metaFor(absPath: string): DocumentMeta {
    const path = resolve(absPath)
    const dir = dirname(path)
    const file = basename(path)
    const stem = file.replace(/\.(md|markdown|mdx)$/i, '')
    return {
      id: docIdFor(path),
      path,
      parentDir: dir,
      stem,
      assetDir: join(dir, assetDirName(stem)),
      inFolder: isDocumentFolder(path)
    }
  }

  async read(absPath: string): Promise<DocumentContent> {
    const meta = this.metaFor(absPath)
    const raw = await fs.readFile(meta.path, 'utf8')
    const parsed = matter(raw)
    return {
      meta,
      text: raw,
      frontmatter: Object.keys(parsed.data).length > 0 ? parsed.data : null,
      body: parsed.content,
      conflictWithDisk: false
    }
  }

  async write(absPath: string, text: string, expected?: string): Promise<void> {
    const path = resolve(absPath)
    const key = process.platform === 'win32' ? path.toLowerCase() : path
    const next = (this.pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (expected !== undefined && await fs.readFile(path, 'utf8') !== expected) {
        throw new Error(t('文件已被其他窗口或程序修改。请复制当前内容后重新打开，避免覆盖已有修改。'))
      }
      await fs.writeFile(path, text, 'utf8')
    })
    this.pending.set(key, next)
    try { await next } finally { if (this.pending.get(key) === next) this.pending.delete(key) }
  }

  /**
   * Create `Notes.md` and, when `withAssetFolder` is set, its asset folder too,
   * so the very first image insert has somewhere portable to land.
   */
  async create(
    dir: string,
    stem: string,
    withAssetFolder: boolean
  ): Promise<DocumentMeta> {
    const safe = stem.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled'
    const path = join(dir, `${safe}.md`)
    try {
      await fs.access(path)
      throw new Error(`already exists: ${path}`)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('already exists')) throw err
    }
    await fs.writeFile(path, `# ${safe}\n\n`, 'utf8')
    const meta = this.metaFor(path)
    if (withAssetFolder) await fs.mkdir(meta.assetDir, { recursive: true })
    return meta
  }

  /**
   * Rename the document and carry its asset folder + every in-document link
   * along with it. Without the rewrite the folder stops being self-contained.
   */
  async rename(absPath: string, nextStem: string): Promise<DocumentMeta> {
    const from = this.metaFor(absPath)
    const safe = nextStem.replace(/[\\/:*?"<>|]/g, '').trim()
    if (!safe || safe === from.stem) return from

    const nextPath = join(from.parentDir, `${safe}.md`)
    await fs.rename(from.path, nextPath)

    const next = this.metaFor(nextPath)
    const oldPrefix = `${basename(from.assetDir)}/`

    try {
      await fs.rename(from.assetDir, next.assetDir)
    } catch {
      // No asset folder yet — nothing to move.
      return next
    }

    const text = await fs.readFile(next.path, 'utf8')
    const rewritten = text.split(oldPrefix).join(`${basename(next.assetDir)}/`)
    if (rewritten !== text) await fs.writeFile(next.path, rewritten, 'utf8')

    return next
  }

  /**
   * Point a document at an asset that already exists on disk, going through
   * the one path builder so it can never emit an absolute path.
   */
  relinkFor(absDocPath: string, assetAbsPath: string): string {
    return toLink(absDocPath, assetAbsPath)
  }

  assetLinkPrefix(absDocPath: string): string {
    const meta = this.metaFor(absDocPath)
    return buildRelativePath(meta.parentDir, meta.assetDir)
  }
}
