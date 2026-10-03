/**
 * Render the standalone HTML to PDF.
 *
 * The HTML builder is a pure function and is tested as one; this file is the
 * thin shell that owns the BrowserWindow, because a window cannot be faked
 * and the interesting parts should not be buried in window plumbing.
 */
import { BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildHtml } from './html'

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

  let temp: string | undefined
  try {
    // Embedded fonts and images exceed Chromium's navigation URL size limit.
    temp = await fs.mkdtemp(join(tmpdir(), 'mdview-pdf-'))
    const page = join(temp, 'document.html')
    // A file URL must not let document HTML fetch other files from this machine.
    const policy = "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:"
    await fs.writeFile(page, build.html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`))
    await win.loadFile(page)

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
    if (temp) await fs.rm(temp, { recursive: true, force: true })
  }
}

export async function writePdf(target: string, pdf: Buffer): Promise<void> {
  await fs.writeFile(target, pdf)
}
