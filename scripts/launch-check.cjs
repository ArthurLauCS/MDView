/**
 * Real Electron check: a document passed on the command line opens at launch,
 * and subsequent file/shortcut launches create independent windows.
 *
 *   npx electron scripts/launch-check.cjs design-review/launch-check-N
 *
 * The script re-runs itself as the second launch; both share one isolated profile.
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const OUT = path.resolve(process.argv[2] || 'design-review/launch-check')
const ROOT = path.resolve(__dirname, '..')
const first = path.join(OUT, 'documents', '第一篇.md')
const second = path.join(OUT, 'documents', '第二篇.md')
const isSecondLaunch = process.argv.includes('--secondary')

fs.mkdirSync(path.join(OUT, 'documents'), { recursive: true })
app.setPath('userData', path.join(OUT, 'profile'))
app.setPath('documents', path.join(OUT, 'documents'))
if (!isSecondLaunch) {
  fs.writeFileSync(first, '# 启动时打开\n')
  fs.writeFileSync(second, '# 第二次启动打开新窗口\n')
  process.argv.push(first)
}
require(path.join(ROOT, 'out/main/index.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  for (let i = 0; i < 60 && !BrowserWindow.getAllWindows().length; i++) await wait(100)
  const win = BrowserWindow.getAllWindows()[0]
  const heading = () => win.webContents.executeJavaScript(`document.querySelector('.live-heading')?.textContent ?? ''`, true)
  const until = async (text) => {
    for (let i = 0; i < 80 && (await heading()) !== text; i++) await wait(100)
    assert.equal(await heading(), text)
  }

  await until('启动时打开')
  console.log('PASS launch argument opens the document')

  await win.webContents.executeJavaScript(`window.__mdview.setSettings({autoSave:false}); window.__mdview.editorContext().replace(0,0,'unsaved ');`)
  for (const [index, args] of [[1, [second]], [2, []]]) {
    const previous = new Set(BrowserWindow.getAllWindows())
    const child = spawn(process.execPath, [__filename, OUT, '--secondary', ...args], { stdio: 'inherit' })
    const exited = new Promise((resolve) => child.on('exit', resolve))
    for (let i = 0; i < 80 && BrowserWindow.getAllWindows().length !== index + 1; i++) await wait(100)
    assert.equal(BrowserWindow.getAllWindows().length, index + 1)
    const opened = BrowserWindow.getAllWindows().find(window => !previous.has(window))
    for (let i = 0; i < 80 && !await opened.webContents.executeJavaScript(`!!document.querySelector('.cm-content')`); i++) await wait(100)
    assert.equal(await opened.webContents.executeJavaScript(`window.__mdview.editorContext().docPath`), index === 1 ? second : null)
    assert.equal(await win.webContents.executeJavaScript(`window.__mdview.editorContext().docPath`), first)
    assert.match(await win.webContents.executeJavaScript(`window.__mdview.editorContext().source`), /^unsaved /)
    await exited
  }
  console.log('PASS repeated file and shortcut launches open independent windows and preserve the original draft')
}

if (!isSecondLaunch) app.whenReady().then(main).then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })
