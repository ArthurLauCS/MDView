import { t } from '../i18n'
/**
 * Package a document folder so it survives the trip to another machine.
 *
 * The whole point of this mode is that the markdown is not rewritten: links
 * stay relative, and because they are relative they keep working after
 * extraction. That only holds if entry names are relative to the document
 * folder and the folder's internal shape is reproduced exactly.
 */
import { promises as fs } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { buildZip, type ZipEntry } from './zip'
/** Directories that are never part of the document, whatever they contain. */
const SKIP_DIRS = new Set(['.mdview', '.git', 'node_modules'])

export interface ZipPlan {
  entries: ZipEntry[]
  /** Absolute paths that were deliberately left out, with a reason. */
  skipped: { path: string; reason: string }[]
  bytes: number
}

function shouldSkipDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name)
}

export function archiveNameFor(docPath: string): string {
  const stem = basename(docPath).replace(/\.(md|markdown|mdx)$/i, '')
  return `${stem}.zip`
}

/**
 * Walk the document folder and collect what travels.
 *
 * Everything that is not hidden comes along: images, other markdown in a
 * multi-document folder, and anything else the author put beside the file.
 * Filtering to known extensions would silently drop a PDF or a data file a
 * document links to, which is the same failure this mode exists to prevent.
 */
export async function planZip(docPath: string): Promise<ZipPlan> {
  const root = join(docPath, '..')
  const entries: ZipEntry[] = []
  const skipped: { path: string; reason: string }[] = []
  let bytes = 0

  const walk = async (dir: string): Promise<void> => {
    const items = await fs.readdir(dir, { withFileTypes: true })
    for (const item of items) {
      const abs = join(dir, item.name)
      const name = relative(root, abs).split('\\').join('/')

      if (item.isDirectory()) {
        if (shouldSkipDir(item.name)) {
          skipped.push({ path: abs, reason: t('隐藏或工具目录，不属于文档') })
          continue
        }
        entries.push({ name: `${name}/`, data: Buffer.alloc(0), directory: true })
        await walk(abs)
        continue
      }

      if (!item.isFile()) {
        skipped.push({ path: abs, reason: t('不是普通文件') })
        continue
      }

      const data = await fs.readFile(abs)
      entries.push({ name, data })
      bytes += data.length
    }
  }

  await walk(root)

  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { entries, skipped, bytes }
}

export async function runZip(docPath: string): Promise<ZipPlan & { archive: Buffer }> {
  const plan = await planZip(docPath)
  return { ...plan, archive: buildZip(plan.entries) }
}
