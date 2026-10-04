/** Real window-scoped IPC, draft preservation, close decisions and conflicting saves. */
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const OUT = path.resolve(process.argv[2] || 'design-review/windows-check')
require('node:fs').mkdirSync(OUT, { recursive: true })
app.setPath('userData', path.join(OUT, 'profile'))
app.setPath('documents', OUT)
const confirmations = []
let response = 2
dialog.showMessageBox = async win => { confirmations.push(win.id); return { response } }
require(path.resolve(__dirname, '../out/main/index.js'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const ctx = 'window.__mdview.editorContext()'
const run = (win, code) => win.webContents.executeJavaScript(code, true)
async function ready(win) {
  for (let i = 0; i < 80; i++) {
    if (await run(win, `!!document.querySelector('.cm-content')`)) return win
    await wait(100)
  }
  throw new Error('Window did not become ready')
}
async function created(action) {
  const opened = new Promise(resolve => app.once('browser-window-created', (_event, win) => resolve(win)))
  await action()
  return ready(await opened)
}
async function main() {
  while (!BrowserWindow.getAllWindows().length) await wait(100)
  const first = await ready(BrowserWindow.getAllWindows()[0])
  await run(first, `window.__mdview.setSettings({autoSave:false,historyEnabled:false,language:'en'})`)
  await run(first, `${ctx}.replace(0,0,'first unsaved draft')`)
  const second = await created(() => {
    first.webContents.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']})
    first.webContents.sendInputEvent({type:'keyUp',keyCode:'N',modifiers:['control']})
  })
  assert.equal(await run(second, `${ctx}.source`), '')
  second.webContents.sendInputEvent({type:'keyUp',keyCode:'N',modifiers:['control']})
  await wait(200)
  assert.equal(BrowserWindow.getAllWindows().length, 2, 'releasing Ctrl+N in the new window must not open another')
  assert.equal(await run(first, `${ctx}.source`), 'first unsaved draft')
  assert.deepEqual(confirmations, [])
  await run(second, `${ctx}.replace(0,0,'second draft')`)
  second.close()
  await wait(250)
  assert.equal(second.isDestroyed(), false)
  assert.deepEqual(confirmations, [second.id])
  assert.equal(await run(first, `${ctx}.source`), 'first unsaved draft')
  response = 1
  second.close()
  await wait(250)
  assert.equal(second.isDestroyed(), true)

  const folderA = path.join(OUT, 'A'), folderB = path.join(OUT, 'B')
  await fs.mkdir(folderA, {recursive:true})
  await fs.mkdir(folderB, {recursive:true})
  const doc = path.join(folderA, 'doc.md')
  await fs.writeFile(doc, '# Original')
  const third = await created(() => run(first, `window.__mdview.openDocument(${JSON.stringify(doc)})`))
  await run(first, `window.__mdview.openWorkspace(${JSON.stringify(folderA)})`)
  await run(third, `window.__mdview.openWorkspace(${JSON.stringify(folderB)})`)
  assert.equal((await run(first, 'window.mdview.workspace.tree()')).rootPath, folderA)
  assert.equal((await run(third, 'window.mdview.workspace.tree()')).rootPath, folderB)
  await run(third, `window.__mdview.setSettings({language:'zh-CN'})`)
  await wait(150)
  assert.equal(await run(first, 'document.documentElement.lang'), 'zh-CN')
  await run(third, 'window.mdview.window.minimize()')
  await wait(150)
  assert.equal(third.isMinimized(), true)
  assert.equal(first.isMinimized(), false)
  third.restore()
  await wait(1400)
  third.webContents.reload()
  await wait(300)
  await ready(third)
  assert.equal((await run(third, 'window.mdview.workspace.tree()')).rootPath, folderB)
  assert.equal(await run(third, `${ctx}.docPath`), doc)

  const fourth = await created(() => run(first, `window.__mdview.openDocument(${JSON.stringify(doc)})`))
  await run(third, `${ctx}.replace(0,${ctx}.source.length,'# Third edit'); ${ctx}.save()`)
  await run(fourth, `${ctx}.replace(0,${ctx}.source.length,'# Fourth edit'); ${ctx}.save()`)
  assert.equal(await fs.readFile(doc, 'utf8'), '# Third edit')
  assert.equal(await run(fourth, `${ctx}.source`), '# Fourth edit')
  assert.match(await run(fourth, `document.querySelector('[role="alert"]').textContent`), /其他窗口/)
  response = 0
  fourth.close()
  await wait(300)
  assert.equal(fourth.isDestroyed(), false, 'failed save must cancel close')
  assert.equal(await run(first, `${ctx}.source`), 'first unsaved draft')
  console.log('PASS new-window Ctrl+N/open, draft preservation, scoped close/cancel/minimize/workspaces, language broadcast, reload and concurrent save protection')
  app.exit(0)
}
app.whenReady().then(() => main().catch(error => { console.error(error); app.exit(1) }))
