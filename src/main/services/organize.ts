import { t } from '../i18n'
/**
 * Turn a loose markdown file into a document folder.
 *
 *   下载/报告.md  →  下载/报告/报告.md + 下载/报告/报告_img/
 *
 * A loose file's images can be anywhere: beside it, on another drive, behind
 * a URL. The folder is only portable once every image it shows lives inside
 * it, so each one is copied in and its link rewritten.
 */
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toLink } from './paths'
import { assetDirName } from './workspace'
import type { OrganizeOptions, OrganizePlan } from '@shared/types'

const FENCE = /^ {0,3}(`{3,}|~{3,})/
// Inline code comes first so an image written inside it is consumed as code.
const LINK = /(`+).*?\1|!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]+src=["']([^"']+)["']/gi
const REMOTE_EXT: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif'
}

/**
 * Visit every image target outside code, replacing those `fn` returns a
 * string for. Line by line: images shown inside fences and inline code are
 * examples for the reader, and rewriting them would corrupt the example.
 */
export function mapImageLinks(text: string, fn: (target: string) => string | null): string {
  let fence: string | null = null
  return text.split('\n').map((line) => {
    const mark = FENCE.exec(line)?.[1]
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null
      return line
    }
    if (mark) {
      fence = mark
      return line
    }
    return line.replace(LINK, (whole, _code, md, html) => {
      const target: string | undefined = md ?? html
      if (!target || target.startsWith('data:')) return whole
      const next = fn(target)
      return next === null ? whole : whole.replace(target, next)
    })
  }).join('\n')
}

const isRemote = (target: string): boolean => /^(https?:)?\/\//i.test(target)

function locate(docDir: string, target: string): string {
  if (/^file:/i.test(target)) return fileURLToPath(target)
  const path = target.replace(/[?#].*$/, '')
  try {
    return resolve(docDir, decodeURIComponent(path))
  } catch {
    return resolve(docDir, path)
  }
}

/** Never let two different images land on one filename. */
function claim(name: string, taken: Set<string>): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let candidate = name
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}${ext}`
  taken.add(candidate.toLowerCase())
  return candidate
}

function targetFor(docPath: string): { stem: string; targetDir: string; targetDoc: string; assetDir: string } {
  const stem = basename(docPath).replace(/\.(md|markdown|mdx)$/i, '')
  const targetDir = join(dirname(docPath), stem)
  return { stem, targetDir, targetDoc: join(targetDir, `${stem}.md`), assetDir: join(targetDir, assetDirName(stem)) }
}

/** A document is in its folder when the folder carries its name. */
export function isDocumentFolder(docPath: string): boolean {
  const { stem } = targetFor(docPath)
  return basename(dirname(docPath)) === stem
}

interface Collected {
  /** Source path → filename inside the new asset folder. */
  local: Map<string, string>
  remote: string[]
  missing: string[]
  taken: Set<string>
}

async function collect(docPath: string, text: string): Promise<Collected> {
  const docDir = dirname(docPath)
  const found: Collected = { local: new Map(), remote: [], missing: [], taken: new Set() }
  const targets: string[] = []
  mapImageLinks(text, (target) => {
    if (!targets.includes(target)) targets.push(target)
    return null
  })
  for (const target of targets) {
    if (isRemote(target)) {
      found.remote.push(target)
      continue
    }
    const abs = locate(docDir, target)
    if (found.local.has(abs)) continue
    try {
      if (!(await fs.stat(abs)).isFile()) throw new Error('not a file')
      found.local.set(abs, claim(basename(abs), found.taken))
    } catch {
      found.missing.push(target)
    }
  }
  return found
}

export async function planOrganize(docPath: string, text: string): Promise<OrganizePlan> {
  const { targetDir } = targetFor(docPath)
  const found = await collect(docPath, text)
  let blocked: string | null = null
  if (isDocumentFolder(docPath)) blocked = t('这份文档已经在自己的文档文件夹里')
  else {
    try {
      await fs.access(targetDir)
      blocked = t('同名文件夹已存在：{0}', targetDir)
    } catch {
      // Free to create.
    }
  }
  return {
    targetDir,
    blocked,
    images: [...found.local].map(([from, name]) => ({ from, name })),
    remote: found.remote,
    missing: found.missing
  }
}

async function download(url: string, assetDir: string, taken: Set<string>): Promise<string> {
  const res = await fetch(url.startsWith('//') ? `https:${url}` : url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  let name = basename(decodeURIComponent(new URL(res.url).pathname)).replace(/[\\/:*?"<>|#%]/g, '-') || 'image'
  if (!extname(name)) name += REMOTE_EXT[type] ?? ''
  name = claim(name, taken)
  await fs.writeFile(join(assetDir, name), Buffer.from(await res.arrayBuffer()))
  return name
}

/**
 * Build the folder. `trash` is injected so the originals go to the recycle
 * bin, which only Electron can reach, while this module stays testable.
 */
export async function runOrganize(
  docPath: string,
  text: string,
  options: OrganizeOptions,
  trash: (path: string) => Promise<void>
): Promise<{ docPath: string; failed: string[] }> {
  const plan = await planOrganize(docPath, text)
  if (plan.blocked) throw new Error(plan.blocked)
  const { stem, targetDir, targetDoc, assetDir } = targetFor(docPath)
  const docDir = dirname(docPath)
  const found = await collect(docPath, text)
  const failed: string[] = []

  await fs.mkdir(targetDir)
  if (found.local.size > 0 || (options.download && found.remote.length > 0)) await fs.mkdir(assetDir)
  for (const [from, name] of found.local) await fs.copyFile(from, join(assetDir, name))

  const remote = new Map<string, string>()
  if (options.download) {
    for (const url of found.remote) {
      try {
        remote.set(url, await download(url, assetDir, found.taken))
      } catch {
        failed.push(url)
      }
    }
  }

  const rewritten = mapImageLinks(text, (target) => {
    const name = isRemote(target) ? remote.get(target) : found.local.get(locate(docDir, target))
    return name ? toLink(targetDoc, join(assetDir, name)) : null
  })
  await fs.writeFile(targetDoc, rewritten, 'utf8')

  if (options.move) {
    await trash(docPath)
    // The old sibling asset folder goes too, but only when nothing in it is
    // left behind — it may hold images this document never referenced.
    const oldAssets = join(docDir, assetDirName(stem))
    const left = await fs.readdir(oldAssets).catch(() => null)
    if (left && left.every((name) => found.local.has(join(oldAssets, name)))) await trash(oldAssets)
  }

  return { docPath: targetDoc, failed }
}
