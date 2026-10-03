/**
 * Previews for the three packaged export modes.
 *
 * `plain-md` reports what it strips from one file; these modes package files
 * that are not modified at all, so the useful thing to report is what did and
 * did not make it in. A preview must stay pure: no save dialog, no window, no
 * write. `pdf` in particular cannot report a page count without printing the
 * document, which would make previewing a document a side-effecting act.
 */
import { basename, join } from 'node:path'
import { planZip, archiveNameFor } from './archive'
import { buildHtml } from './html'
import type { AppSettings, ExportMode, ExportPreview } from '@shared/types'

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function previewFor(
  mode: ExportMode,
  docPath: string,
  removals: { line: number; text: string; reason: string }[],
  summary: string,
  targetName: string
): ExportPreview {
  return {
    mode,
    removals,
    output: summary,
    targetPath: join(docPath, '..', targetName)
  }
}

export async function previewZip(docPath: string): Promise<ExportPreview> {
  const { entries, skipped } = await planZip(docPath)
  const dirs = entries.filter((e) => e.directory).length
  const files = entries.length - dirs
  const bytes = entries.reduce((n, e) => n + e.data.length, 0)

  const removals = skipped.map((s, i) => ({
    line: i + 1,
    text: basename(s.path),
    reason: s.reason
  }))

  const summary =
    `将打包 ${files} 个文件` +
    (dirs > 0 ? `、${dirs} 个文件夹` : '') +
    `，共 ${humanBytes(bytes)}。` +
    `文档内的相对链接不会改动，解压后即可直接打开。` +
    (removals.length > 0 ? `另有 ${removals.length} 项未包含。` : '')

  return previewFor('zip', docPath, removals, summary, archiveNameFor(docPath))
}

export async function previewHtml(
  docPath: string,
  text: string,
  settings: AppSettings
): Promise<ExportPreview> {
  const build = await buildHtml(docPath, text, settings.theme === 'light' ? 'light' : 'dark')

  const removals = build.missing.map((m, i) => ({
    line: i + 1,
    text: basename(m.path),
    reason: m.reason
  }))

  const summary =
    `将生成一个自包含的 HTML 文件，约 ${humanBytes(build.bytes)}。` +
    `已内嵌 ${build.inlined.length} 张本地图片` +
    (build.external.length > 0 ? `，保留 ${build.external.length} 个网络图片地址` : '') +
    `。打开时不产生任何网络请求。` +
    (removals.length > 0 ? `有 ${removals.length} 张本地图片读不到，将显示占位符。` : '')

  const stem = basename(docPath).replace(/\.(md|markdown|mdx)$/i, '')
  return previewFor('html', docPath, removals, summary, `${stem}.html`)
}

/**
 * The PDF preview reuses the HTML build so the reported cost is the real one.
 *
 * It deliberately does not report a page count: that needs a print run, and a
 * preview that opens a window is not a preview.
 */
export async function previewPdf(
  docPath: string,
  text: string,
  settings: AppSettings
): Promise<ExportPreview> {
  const build = await buildHtml(docPath, text, settings.theme === 'light' ? 'light' : 'dark')

  const removals = build.missing.map((m, i) => ({
    line: i + 1,
    text: basename(m.path),
    reason: m.reason
  }))

  const summary =
    `将按 A4 排版输出 PDF，约 ${humanBytes(build.bytes)} 的 HTML 内容。` +
    `已内嵌 ${build.inlined.length} 张本地图片。` +
    `分页由排版决定，导出后才能确定页数。` +
    (removals.length > 0 ? `有 ${removals.length} 张本地图片读不到，将显示占位符。` : '')

  const stem = basename(docPath).replace(/\.(md|markdown|mdx)$/i, '')
  return previewFor('pdf', docPath, removals, summary, `${stem}.pdf`)
}
