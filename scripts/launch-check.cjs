/**
 * Real Electron check: a document passed on the command line opens at launch,
 * and a second launch hands its document to the running window.
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
const isSecondLaunch = process.argv.includes(second)

fs.mkdirSync(path.join(OUT, 'documents'), { recursive: true })
app.setPath('userData', path.join(OUT, 'profile'))
app.setPath('documents', path.join(OUT, 'documents'))
if (!isSecondLaunch) {
  fs.writeFileSync(first, '# 启动时打开\n')
  fs.writeFileSync(second, '# 第二次启动交给已有窗口\n')
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

  const child = spawn(process.execPath, [__filename, OUT, second], { stdio: 'inherit' })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  await until('第二次启动交给已有窗口')
  await exited
  assert.equal(BrowserWindow.getAllWindows().length, 1)
  console.log('PASS second launch reuses the window and exits')
}

if (!isSecondLaunch) app.whenReady().then(main).then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })
