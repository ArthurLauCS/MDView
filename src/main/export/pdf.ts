/**
 * Render the standalone HTML to PDF.
 *
 * The HTML builder is a pure function and is tested as one; this file is the
 * thin shell that owns the BrowserWindow, because a window cannot be faked
 * and the interesting parts should not be buried in window plumbing.
 */
import { BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { buildHtml } from './html'

/**
 * `printToPDF` needs a document URL. A data URL keeps the whole pipeline
 * single-file — no temp file to leak if the process dies mid-export — and
 * can exceed Chromium's URL length limit on an image-heavy document, so
 * base64 of the UTF-8 bytes is used rather than an escaped string.
 */
function toDataUrl(html: string): string {
  return `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`
}

export async function renderPdf(
  docPath: string,
  source: string,
  theme: 'dark' | 'light' = 'dark'
): Promise<{ pdf: Buffer; build: Awaited<ReturnType<typeof buildHtml>> }> {
  const build = await buildHtml(docPath, source, theme)

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      // The document is untrusted markup from a file on disk; it gets no
      // bridge to this process and no network access it did not already have.
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false
    }
  })

  try {
    // Nothing to wait for after load: images are data URIs, the stylesheet
    // uses system fonts only, and scripts are off in this window.
    await win.loadURL(toDataUrl(build.html))

    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 },
      landscape: false,
      preferCSSPageSize: false
    })
    return { pdf, build }
  } finally {
    // Dispose even when printing threw — an offscreen window that outlives
    // its export keeps a renderer process alive for the rest of the session.
    win.destroy()
  }
}

export async function writePdf(target: string, pdf: Buffer): Promise<void> {
  await fs.writeFile(target, pdf)
}
