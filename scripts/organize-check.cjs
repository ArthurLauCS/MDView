/**
 * Real Electron check: a loose markdown file is offered, previewed and turned
 * into a document folder, and ZIP export refuses to pack a folder it does not own.
 *
 *   npx electron scripts/organize-check.cjs design-review/organize-check-N
 */
const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const OUT = path.resolve(process.argv[2] || 'design-review/organize-check')
const ROOT = path.resolve(__dirname, '..')
const INBOX = path.join(OUT, 'documents', '收件箱')
// The recycle bin is real and shared; a check must not fill it.
const trashed = []
shell.trashItem = async (target) => { trashed.push(target); fs.rmSync(target, { recursive: true }) }

fs.rmSync(path.join(OUT, 'documents'), { recursive: true, force: true })
fs.mkdirSync(path.join(INBOX, '周报_img'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'documents', '别处'), { recursive: true })
const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" rx="12" fill="#d97757"/><text x="160" y="68" text-anchor="middle" font-size="22" fill="#fff">${label}</text></svg>`
fs.writeFileSync(path.join(INBOX, '周报_img', '进度.svg'), svg('进度'))
const far = path.join(OUT, 'documents', '别处', '截图.svg')
fs.writeFileSync(far, svg('别处的截图'))
fs.writeFileSync(path.join(INBOX, '无关文件.txt'), '不属于这份文档')
const doc = path.join(INBOX, '周报.md')
fs.writeFileSync(doc, [
  '# 周报', '',
  '![进度](./周报_img/进度.svg)', '',
  `![截图](${far.split(path.sep).join('/')})`, '',
  '![丢失](./没有这张.png)', '',
  '```md', '![示例](./周报_img/进度.svg)', '```', ''
].join('\n'))

app.setPath('userData', path.join(OUT, 'profile'))
app.setPath('documents', path.join(OUT, 'documents'))
process.argv.push(doc)
require(path.join(ROOT, 'out/main/index.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  for (let i = 0; i < 60 && !BrowserWindow.getAllWindows().length; i++) await wait(100)
  const win = BrowserWindow.getAllWindows()[0]
  win.setSize(1440, 900)
  const run = (code) => win.webContents.executeJavaScript(code, true)
  const shot = async (name) => fs.writeFileSync(path.join(OUT, `${name}.png`), (await win.webContents.capturePage()).toPNG())
  const until = async (code, what) => {
    for (let i = 0; i < 80 && !(await run(code)); i++) await wait(100)
    assert.ok(await run(code), what)
  }
  await until(`!!document.querySelector('.ep__loose')`, 'loose file is flagged')
  await run(`window.__mdview.setSettings({ theme: 'dark', motion: 'off', sidebarVisible: true })`)
  await wait(400)
  await shot('01-loose-hint')

  run(`window.__mdview.openPanel('export')`)
  await until(`document.querySelectorAll('.mode').length === 4`, 'export panel opens')
  await run(`document.querySelectorAll('.mode')[1].click()`)
  await wait(400)
  assert.equal(await run(`document.querySelector('.panel__foot .btn--primary').disabled`), true)
  await shot('02-zip-needs-folder')
  await run(`document.querySelector('.panel__link').click()`)

  await until(`document.querySelectorAll('.panel .diff__row').length === 3`, 'plan lists two images and one missing')
  await shot('03-organize-plan')
  await run(`Array.from(document.querySelectorAll('.panel .seg__item')).find(b => b.textContent === '移入回收站').click()`)
  await run(`document.querySelector('.panel__foot .btn--primary').click()`)
  await until(`!document.querySelector('.panel') && !document.querySelector('.ep__loose')`, 'document reopens from its folder')
  await wait(500)

  const folder = path.join(INBOX, '周报')
  const text = fs.readFileSync(path.join(folder, '周报.md'), 'utf8')
  assert.match(text, /!\[截图\]\(\.\/周报_img\/截图\.svg\)/)
  assert.match(text, /!\[丢失\]\(\.\/没有这张\.png\)/)
  assert.deepEqual(fs.readdirSync(path.join(folder, '周报_img')).sort(), ['截图.svg', '进度.svg'])
  assert.deepEqual(trashed, [doc, path.join(INBOX, '周报_img')])
  assert.ok(fs.existsSync(far) && fs.existsSync(path.join(INBOX, '无关文件.txt')))
  await until(`Array.from(document.querySelectorAll('.live-rendered img')).filter(i => i.naturalWidth > 0).length === 2`, 'both copied images load')
  await shot('04-organized')

  run(`window.__mdview.openPanel('export')`)
  await until(`document.querySelectorAll('.mode').length === 4`, 'export panel opens again')
  await run(`document.querySelectorAll('.mode')[1].click()`)
  await until(`/将打包 3 个文件/.test(document.querySelector('.panel__body').textContent)`, 'zip packs only the document folder')
  console.log('PASS loose hint, zip guard, organize with move, images load from the new folder')
}

app.whenReady().then(main).then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })
