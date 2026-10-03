import { promises as fs } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { TreeNode, WorkspaceInfo } from '@shared/types'

const IGNORED = new Set(['node_modules', '.git', '.mdview', '.obsidian', '.trash'])

/** Stable document id from an absolute path — case-insensitive on Windows. */
export function docIdFor(absPath: string): string {
  return createHash('sha1').update(absPath.toLowerCase()).digest('hex').slice(0, 16)
}

/** `Notes_img` for `Notes` — the one place this naming rule lives. */
export function assetDirName(stem: string): string {
  return `${stem}_img`
}

export function isAssetDirName(name: string): boolean {
  return name.endsWith('_img') || name === 'img' || name === 'assets'
}

export class WorkspaceService {
  private root: WorkspaceInfo | null = null

  get current(): WorkspaceInfo | null {
    return this.root
  }

  get rootPath(): string {
    if (!this.root) throw new Error('no workspace is open')
    return this.root.rootPath
  }

  async open(absPath: string): Promise<WorkspaceInfo> {
    const stat = await fs.stat(absPath)
    const rootPath = stat.isDirectory() ? resolve(absPath) : resolve(absPath, '..')
    const tree = await this.scan(rootPath)
    this.root = {
      rootPath,
      name: basename(rootPath),
      tree,
      openedAt: Date.now()
    }
    return this.root
  }

  /** Recursive scan. Prunes ignored dirs and asset dirs before descending. */
  async scan(dir: string, depth = 0): Promise<TreeNode> {
    if (depth > 12) {
      return this.dirNode(dir, [])
    }
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const children: TreeNode[] = []

    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.isDirectory()) continue

      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Asset dirs are listed but not walked — they only ever hold binaries.
        if (isAssetDirName(entry.name)) {
          children.push(await this.assetDirNode(abs, entry.name))
          continue
        }
        children.push(await this.scan(abs, depth + 1))
      } else if (entry.isFile() && /\.(md|markdown|mdx)$/i.test(entry.name)) {
        const st = await fs.stat(abs)
        children.push({
          name: entry.name,
          path: abs,
          kind: 'file',
          docId: docIdFor(abs),
          isAssetDir: false,
          children: null,
          mtimeMs: st.mtimeMs,
          sizeBytes: st.size
        })
      }
    }

    return this.dirNode(dir, children)
  }

  private async dirNode(dir: string, children: TreeNode[]): Promise<TreeNode> {
    children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true })
    })
    const st = await fs.stat(dir)
    return {
      name: basename(dir),
      path: dir,
      kind: 'dir',
      docId: null,
      isAssetDir: false,
      children,
      mtimeMs: st.mtimeMs,
      sizeBytes: 0
    }
  }

  private async assetDirNode(dir: string, name: string): Promise<TreeNode> {
    const st = await fs.stat(dir)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const children: TreeNode[] = entries
      .filter((e) => e.isFile())
      .map((e) => ({
        name: e.name,
        path: join(dir, e.name),
        kind: 'file' as const,
        docId: null,
        isAssetDir: true,
        children: null,
        mtimeMs: st.mtimeMs,
        sizeBytes: 0
      }))
    return {
      name,
      path: dir,
      kind: 'dir',
      docId: null,
      isAssetDir: true,
      children,
      mtimeMs: st.mtimeMs,
      sizeBytes: 0
    }
  }

  async rescan(): Promise<WorkspaceInfo> {
    return this.open(this.rootPath)
  }
}
