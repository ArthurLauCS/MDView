/**
 * Visual verification harness.
 *
 * Boots the real application — same main process, same IPC handlers, same
 * preload — then drives the UI into a few states and writes PNGs.
 * Screenshots are the only honest way to check a design claim, so this is a
 * first-class script rather than a debug leftover.
 *
 *   node scripts/shoot.cjs [outDir]
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const OUT = path.resolve(process.argv[2] || 'design-review/round-1')
const ROOT = path.resolve(__dirname, '..')
const SAMPLE = path.join(ROOT, 'sample')

// Load the app's own main process first so every IPC handler is registered
// before any window exists.
require(path.join(ROOT, 'out/main/index.js'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(win, name) {
  const img = await win.webContents.capturePage()
  await fs.mkdir(OUT, { recursive: true })
  await fs.writeFile(path.join(OUT, `${name}.png`), img.toPNG())
  console.log('wrote', `${name}.png`)
}

function firstWindow() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) throw new Error('no window was created by the main process')
  return win
}

async function main() {
  // Wait for the main process to have finished creating its window.
  for (let i = 0; i < 60 && BrowserWindow.getAllWindows().length === 0; i++) {
    await wait(100)
  }
  const win = firstWindow()
  win.setSize(1440, 900)
  await wait(1500)

  await shoot(win, '01-welcome')

  await win.webContents.executeJavaScript(
    `window.__mdview.openWorkspace(${JSON.stringify(SAMPLE)})`
  )
  await wait(1200)
  await shoot(win, '02-sidebar')

  const docPath = path.join(SAMPLE, '我的笔记', '我的笔记.md')
  await win.webContents.executeJavaScript(
    `window.__mdview.openDocument(${JSON.stringify(docPath)})`
  )
  console.log('opened:', docPath)
  await wait(1400)
  await shoot(win, '03-editor-source')

  const clickMode = (label) =>
    win.webContents.executeJavaScript(`
      (() => {
        const b = [...document.querySelectorAll('.ep__mode')].find((x) => x.textContent.includes(${JSON.stringify(label)}))
        if (b) b.click()
        return !!b
      })()
    `)

  await clickMode('阅读')
  await wait(1100)
  await shoot(win, '04-read')

  // Scroll the rendered view down to the table and code sections — those are
  // the two blocks most likely to have layout defects.
  await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.ep__preview')
      if (!el) return false
      const table = el.querySelector('table')
      if (table) { el.scrollTop = table.offsetTop - 60; return true }
      return false
    })()
  `)
  await wait(800)
  await shoot(win, '04b-table')

  await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.ep__preview')
      if (!el) return false
      const code = el.querySelector('.codeblock')
      if (code) { el.scrollTop = code.offsetTop - 40; return true }
      return false
    })()
  `)
  await wait(800)
  await shoot(win, '04c-code')

  // The language badge and copy button are hover-only, so read them out and
  // force them visible for the screenshot.
  const detected = await win.webContents.executeJavaScript(`
    (() => {
      const blocks = [...document.querySelectorAll('.codeblock')]
      const info = blocks.map((b) => ({
        lang: b.dataset.lang,
        confidence: b.dataset.confidence ?? null
      }))
      blocks.forEach((b) => {
        const bar = b.querySelector('.codeblock__bar')
        if (bar) bar.style.opacity = '1'
      })
      return info
    })()
  `)
  console.log('detected languages:', JSON.stringify(detected))
  await wait(300)
  await shoot(win, '04d-code-badges')

  await clickMode('分栏')
  await wait(1100)
  await shoot(win, '05-split')

  await win.webContents.executeJavaScript(`window.__mdview.setSettings({ theme: 'light' })`)
  await wait(800)
  await shoot(win, '06-light-split')

  await win.webContents.executeJavaScript(`window.__mdview.setSettings({ theme: 'dark' })`)
  await clickMode('源码')
  await wait(800)

  // Command palette
  await win.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }))
  `)
  await wait(900)
  await shoot(win, '07-palette')

  await win.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  `)
  await wait(500)
  const paletteClosed = await win.webContents.executeJavaScript(
    `!document.querySelector('.palette')`
  )
  console.log('palette closed by Escape:', paletteClosed)

  // Context menu with a selection in the editor
  await win.webContents.executeJavaScript(`
    (() => {
      const ta = document.querySelector('.editor__input')
      if (!ta) return false
      ta.focus()
      ta.setSelectionRange(600, 660)
      const r = ta.getBoundingClientRect()
      ta.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: r.left + 260, clientY: Math.min(r.top + 240, window.innerHeight - 60)
      }))
      return true
    })()
  `)
  await wait(900)
  await shoot(win, '08-contextmenu')

  await win.webContents.executeJavaScript(
    `document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`
  )
  await wait(400)

  // Narrow breakpoints
  win.setSize(900, 900)
  await wait(800)
  await shoot(win, '09-narrow-900')

  win.setSize(600, 860)
  await wait(800)
  await shoot(win, '10-narrow-600')

  win.setSize(1440, 900)
  await wait(600)
  app.quit()
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('shoot failed:', err)
    app.exit(1)
  })
)
