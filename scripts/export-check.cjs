/** Real Electron check: front matter display and every export mode writes a real file. Isolated profile. */
const { app, BrowserWindow, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const OUT = path.resolve(process.argv[2] || 'design-review/export-check')
const ROOT = path.resolve(__dirname, '..')
const saves = []
dialog.showSaveDialog = async () => ({ canceled: false, filePath: saves.shift() })
require('node:fs').mkdirSync(path.join(OUT, 'documents'), { recursive: true })
app.setPath('userData', path.join(OUT, 'profile'))
app.setPath('documents', path.join(OUT, 'documents'))
require(path.join(ROOT, 'out/main/index.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const docDir = path.join(OUT, 'workspace', '欢迎使用')
  await fs.cp(path.join(ROOT, 'stock', '欢迎使用'), docDir, { recursive: true })
  for (let i = 0; i < 60 && !BrowserWindow.getAllWindows().length; i++) await wait(100)
  const win = BrowserWindow.getAllWindows()[0]
  win.setSize(1440, 900)
  const run = (code) => win.webContents.executeJavaScript(code, true)
  const shot = async (name) => fs.writeFile(path.join(OUT, `${name}.png`), (await win.webContents.capturePage()).toPNG())
  await wait(1200)
  await run(`window.__mdview.setSettings({ theme: 'dark', sidebarVisible: true, autoSave: false, motion: 'off' })`)
  await run(`window.__mdview.openDocument(${JSON.stringify(path.join(docDir, '欢迎使用.md'))})`)
  await wait(800)

  assert.equal(await run(`document.querySelectorAll('.live-frontmatter').length`), 5)
  assert.equal(await run(`document.querySelector('.live-heading').textContent`), '图片应该跟着文档走')
  assert.equal(await run(`!!Array.from(document.querySelectorAll('.sidebar *')).find(el => el.textContent.startsWith('title:'))`), false)
  await shot('01-frontmatter')

  run(`window.__mdview.openPanel('export')`)
  await wait(500)
  const magic = { md: null, zip: 'PK', html: '<!doctype html>', pdf: '%PDF' }
  for (const [index, ext] of Object.keys(magic).entries()) {
    const target = path.join(OUT, 'documents', `out.${ext}`)
    saves.push(target)
    await run(`document.querySelectorAll('.mode')[${index}].click()`)
    await wait(1200)
    await shot(`02-export-${ext}`)
    await run(`document.querySelector('.panel__foot .btn--primary').click()`)
    for (let i = 0; i < 100 && !(await run(`document.querySelector('.panel__foot').textContent.includes('已导出到')`)); i++) await wait(100)
    const data = await fs.readFile(target)
    assert.ok(data.length > 500, `${ext} is empty`)
    if (magic[ext]) assert.ok(data.subarray(0, 20).toString().startsWith(magic[ext]), `${ext} has wrong content`)
    console.log('PASS', ext, data.length, 'bytes')
  }
  assert.doesNotMatch(await fs.readFile(path.join(OUT, 'documents', 'out.html'), 'utf8'), /title: 欢迎使用/)
}

app.whenReady().then(main).then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })
