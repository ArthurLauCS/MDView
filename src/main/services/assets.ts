import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { nativeImage } from 'electron'
import { toLink } from './paths'
import { mapImageLinks } from './organize'
import type { AssetRef, InsertedAsset } from '@shared/types'
import type { WorkspaceService } from './workspace'
import type { DocumentService } from './documents'
import type { SettingsService } from './settings'

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp'
])

export class AssetService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly documents: DocumentService,
    private readonly settings: SettingsService
  ) {}

  private stamp(): string {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  /** The stored filename for a new asset, per the user's naming preference. */
  private nameFor(stem: string, hash: string, ext: string): string {
    switch (this.settings.get().imageNaming) {
      case 'original':
        return `${stem}${ext}`
      case 'hash':
        return `${hash.slice(0, 12)}${ext}`
      default:
        return `${this.stamp()}-${hash.slice(0, 4)}-${stem}${ext}`
    }
  }

  private async sha256(buf: Buffer): Promise<string> {
    return createHash('sha256').update(buf).digest('hex')
  }

  /**
   * Scale a too-wide image down on the way in.
   *
   * A screenshot pasted from a 4K display is otherwise stored at full size
   * and swamps the document; capping it at insert time is the only moment
   * the original is still available to do it losslessly.
   *
   * SVG is skipped — it is resolution independent and nativeImage would
   * rasterize it, which is strictly worse.
   */
  private capWidth(buf: Buffer, ext: string): Buffer {
    const max = this.settings.get().imageMaxWidth
    if (max <= 0 || ext === '.svg' || ext === '.gif') return buf

    try {
      const img = nativeImage.createFromBuffer(buf)
      if (img.isEmpty()) return buf
      const { width } = img.getSize()
      if (width <= max) return buf
      const ratio = max / width
      return nativeImage
        .createFromBuffer(buf)
        .resize({ width: max, height: Math.round(img.getSize().height * ratio), quality: 'good' })
        .toPNG()
    } catch {
      // An image we cannot decode is not a reason to refuse the insert.
      return buf
    }
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

    // Downscale before hashing: the stored file is what the document points
    // at, so dedupe must key on the bytes that are actually written.
    const capped = this.capWidth(data, ext)
    if (capped !== data) {
      data = capped
      ext = '.png'
    }

    const hash = await this.sha256(data)
    const index = await this.hashIndex(meta.assetDir)

    const existing = this.settings.get().imageDedupe ? index.get(hash) : undefined
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
      ? basename(originalName, extname(originalName)).replace(/[\\/:*?"<>|#?%]/g, '-')
      : 'paste'
    const fileName = this.uniqueName(this.nameFor(stem, hash, ext), index)
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

  /**
   * Never overwrite. With naming set to `original` two photos called
   * `image.png` would otherwise silently become one, and the second insert
   * would point at the first one's bytes.
   */
  private uniqueName(name: string, taken: Map<string, string>): string {
    const names = new Set(taken.values())
    if (!names.has(name)) return name
    const ext = extname(name)
    const stem = name.slice(0, name.length - ext.length)
    for (let n = 2; n < 1000; n++) {
      const candidate = `${stem}-${n}${ext}`
      if (!names.has(candidate)) return candidate
    }
    return name
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
    const targets = new Set<string>()
    mapImageLinks(text, target => { targets.add(target); return null })

    for (const raw of targets) {
      if (/^(https?:)?\/\//.test(raw) || raw.startsWith('data:')) continue
      const decoded = decodeURIComponent(raw)
      const absPath = resolve(meta.parentDir, decoded)
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
          mapImageLinks(text, target => {
            if (!/^(https?:)?\/\//i.test(target)) referenced.add(join(meta.parentDir, decodeURIComponent(target)))
            return null
          })
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
