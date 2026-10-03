import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { basename as base, dirname } from 'node:path'
import { toLink } from './paths'
import type { AssetRef, InsertedAsset } from '@shared/types'
import type { WorkspaceService } from './workspace'
import type { DocumentService } from './documents'

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp'
])

export class AssetService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly documents: DocumentService
  ) {}

  private stamp(): string {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  private async sha256(buf: Buffer): Promise<string> {
    return createHash('sha256').update(buf).digest('hex')
  }

  /** Existing files in the asset dir, keyed by content hash, for dedupe. */
  private async hashIndex(assetDir: string): Promise<Map<string, string>> {
    const index = new Map<string, string>()
    let names: string[]
    try {
      names = await fs.readdir(assetDir)
    } catch {
      return index
    }
    for (const name of names) {
      if (!IMAGE_EXT.has(extname(name).toLowerCase())) continue
      const buf = await fs.readFile(join(assetDir, name))
      index.set(await this.sha256(buf), name)
    }
    return index
  }

  /**
   * Write image bytes beside the document and return the link to insert.
   * Identical content is reused rather than duplicated.
   */
  async insert(
    docAbsPath: string,
    data: Buffer,
    originalName: string | null,
    ext = '.png'
  ): Promise<InsertedAsset> {
    const meta = this.documents.metaFor(docAbsPath)
    await fs.mkdir(meta.assetDir, { recursive: true })

    const hash = await this.sha256(data)
    const index = await this.hashIndex(meta.assetDir)

    const existing = index.get(hash)
    if (existing) {
      return {
        relPath: toLink(meta.path, join(meta.assetDir, existing)),
        absPath: join(meta.assetDir, existing),
        reused: true,
        bytes: data.length,
        width: null,
        height: null
      }
    }

    const stem = originalName
      ? base(originalName, extname(originalName)).replace(/[\\/:*?"<>|#?%]/g, '-')
      : 'paste'
    const fileName = `${this.stamp()}-${hash.slice(0, 4)}-${stem}${ext}`
    const absPath = join(meta.assetDir, fileName)
    await fs.writeFile(absPath, data)

    return {
      relPath: toLink(meta.path, absPath),
      absPath,
      reused: false,
      bytes: data.length,
      width: null,
      height: null
    }
  }

  /** Copy an existing file (drag-drop from Explorer) into the asset folder. */
  async insertFromPath(docAbsPath: string, srcPath: string): Promise<InsertedAsset> {
    const data = await fs.readFile(srcPath)
    return this.insert(docAbsPath, data, basename(srcPath), extname(srcPath).toLowerCase())
  }

  /** Every image link in a document, resolved and checked for existence. */
  async refs(docAbsPath: string, text: string): Promise<AssetRef[]> {
    const meta = this.documents.metaFor(docAbsPath)
    const out: AssetRef[] = []
    const linkRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
    const htmlRe = /<img[^>]+src=["']([^"']+)["']/gi

    const targets = new Set<string>()
    for (const m of text.matchAll(linkRe)) targets.add(m[1])
    for (const m of text.matchAll(htmlRe)) targets.add(m[1])

    for (const raw of targets) {
      if (/^(https?:)?\/\//.test(raw) || raw.startsWith('data:')) continue
      const decoded = decodeURIComponent(raw)
      const absPath = join(meta.parentDir, decoded)
      const inside = !decoded.replace(/\\/g, '/').split('/').includes('..')
      let exists = false
      try {
        await fs.access(absPath)
        exists = true
      } catch {
        exists = false
      }
      out.push({ relPath: raw, absPath, exists, insideDocFolder: inside })
    }
    return out
  }

  /** Files in the asset dir that no document in the workspace references. */
  async orphans(): Promise<string[]> {
    const root = this.workspace.rootPath
    const referenced = new Set<string>()
    const assetFiles: string[] = []

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const abs = join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name.endsWith('_img') || e.name === 'assets' || e.name === 'img') {
            for (const f of await fs.readdir(abs)) {
              if (IMAGE_EXT.has(extname(f).toLowerCase())) assetFiles.push(join(abs, f))
            }
            continue
          }
          await walk(abs)
        } else if (/\.(md|markdown)$/i.test(e.name)) {
          const text = await fs.readFile(abs, 'utf8')
          const meta = this.documents.metaFor(abs)
          for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
            referenced.add(join(meta.parentDir, decodeURIComponent(m[1])))
          }
        }
      }
    }

    try {
      await walk(root)
    } catch {
      return []
    }
    return assetFiles.filter((f) => !referenced.has(f))
  }

  async readDataUrl(absPath: string): Promise<string> {
    const buf = await fs.readFile(absPath)
    const ext = extname(absPath).slice(1).toLowerCase()
    const mime =
      ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    return `data:${mime};base64,${buf.toString('base64')}`
  }

  /** Resolve a link written in markdown into an on-disk path. */
  resolveLink(docAbsPath: string, link: string): string {
    return join(dirname(docAbsPath), decodeURIComponent(link))
  }
}
