/** CodeMirror input and floating submenus in the real Electron renderer. */
const { app, BrowserWindow, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const OUT = path.resolve(process.argv[2] || 'design-review/code-block-menu')
require('node:fs').mkdirSync(OUT, { recursive: true })
app.setPath('userData', path.join(OUT, 'profile'))
dialog.showMessageBox = async () => ({ response: 1 })
require(path.resolve(__dirname, '../out/main/index.js'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  for (let i = 0; i < 80 && !BrowserWindow.getAllWindows().length; i++) await wait(100)
  const win = BrowserWindow.getAllWindows()[0]
  win.setSize(1200, 850)
  const run = code => win.webContents.executeJavaScript(code, true)
  const ctx = 'window.__mdview.editorContext()'
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  const press = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await wait(100)
  }
  const type = async text => {
    for (const char of text) { await win.webContents.insertText(char); await wait(20) }
    await wait(100)
  }
  const edit = async (source, at = source.length, end = at) => {
    await run(`${ctx}.replace(0,${ctx}.source.length,${JSON.stringify(source)}); ${ctx}.select(${at},${end})`)
    await wait(150)
  }
  const text = () => run(`${ctx}.source`)
  const point = selector => run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)} })()`)
  const move = async p => { win.webContents.sendInputEvent({ type: 'mouseMove', ...p }); await wait(100) }
  const click = async p => {
    await move(p)
    win.webContents.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 })
    await wait(150)
  }
  const shot = async name => {
    await wait(180)
    await fs.writeFile(path.join(OUT, name + '.png'), (await win.webContents.capturePage()).toPNG())
  }
  await wait(1500)
  await run('document.fonts.ready.then(() => true)')
  await run(`window.__mdview.setSettings({autoSave:false,historyEnabled:false,sidebarVisible:false,motion:'off'})`)
  for (const autoPair of [true, false]) {
    await run(`window.__mdview.setSettings({autoPair:${autoPair}})`)
    await edit('')
    await type('```')
    assert.equal(await text(), '```', 'three literal backticks without an extra closing tick')
    await press('Enter')
    assert.equal(await text(), '```\n\n```', 'Enter creates a complete fence')
    await type('def greet(name):')
    assert.equal(await text(), '```\ndef greet(name):\n```', 'characters stay in input order')
    assert.equal(await run(`${ctx}.cursor`), 20)
    await press('Enter')
    await type('    return name')
    assert.equal(await run(`document.querySelector('.live-code-language').selectedOptions[0].textContent`), '自动检测 · python')
    assert.ok(await run(`document.querySelectorAll('.live-code-line .hljs-keyword').length`) > 0,
      JSON.stringify(errors) + await run(`JSON.stringify({source:${ctx}.source,html:document.querySelector('.cm-content').innerHTML})`))
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Input.imeSetComposition', { text: 'zhong', selectionStart: 5, selectionEnd: 5 })
    await win.webContents.debugger.sendCommand('Input.insertText', { text: '中文' })
    win.webContents.debugger.detach()
    await wait(150)
    assert.match(await text(), /return name中文\n```$/)
    const footer = await point('.live-code-end')
    await click({ x: footer.x, y: footer.y + 40 })
    await type('正文')
    assert.match(await text(), /\n```\n\n正文$/, 'click below the block creates prose')
  }

  const source = '```\ndef greet(name):\n    return name\n```\n\n后续正文'
  await edit(source, source.indexOf('name'))
  const bodyPoint = await run(`(() => {
    const el = document.querySelector('.live-code-line:not(.live-code-header):not(.live-code-end)')
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n, offset = 6
    while (n = walker.nextNode()) {
      if (offset < n.length) { const r = document.createRange(); r.setStart(n,offset); r.setEnd(n,offset+1); const b = r.getBoundingClientRect(); return {x:Math.round(b.left+1),y:Math.round((b.top+b.bottom)/2)} }
      offset -= n.length
    }
  })()`)
  await click(bodyPoint)
  assert.equal(await run(`${ctx}.cursor`), source.indexOf('def') + 6, 'click matches the code text position')
  await type('X')
  assert.match(await text(), /def grXeet/)
  await press('z', ['control'])
  assert.equal(await text(), source)
  await run(`document.querySelector('.live-code-language').focus()`)
  await press('Home')
  await press('Down')
  assert.match(await text(), /^```text\n/, 'native language selection updates Markdown')
  await press('z', ['control'])
  assert.equal(await text(), source, 'language selection can be undone')
  await click(await point('.live-code-end'))
  await type('继续')
  assert.match(await text(), /```\n继续\n后续正文$/, 'footer reuses the existing blank paragraph')
  await run(`${ctx}.select(${ctx}.source.length,${ctx}.source.length)`)
  await move(await point('.editor__status'))
  assert.equal(await run(`getComputedStyle(document.querySelector('.live-code-language')).opacity`), '0')
  await move(await point('.live-code-line:not(.live-code-header):not(.live-code-end)'))
  assert.equal(await run(`getComputedStyle(document.querySelector('.live-code-language')).opacity`), '1')
  await shot('01-code-language-hover')
  await run(`window.__mdview.setSettings({theme:'light',readOnly:true})`)
  assert.equal(await run(`document.querySelector('.live-code-language').disabled`), true)
  const readOnlySource = await text()
  await click(await point('.live-code-end'))
  await type('readonly')
  assert.equal(await text(), readOnlySource)
  await shot('02-code-light-readonly')
  await run(`window.__mdview.setSettings({theme:'dark',readOnly:false})`)

  const menu = async (x, y) => {
    await edit('菜单测试', 0, 4)
    await run(`document.querySelector('.cm-content').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:${x},clientY:${y}}))`)
    await wait(200)
    await move(await point('[data-submenu-index]'))
  }
  for (const [x, y, side] of [[100, 100, 'right'], [1180, 780, 'left']]) {
    await menu(x, y)
    const bounds = await run(`(() => {
      const main = document.querySelector('.ctxmenu:not(.ctxmenu--sub)'), sub = document.querySelector('.ctxmenu--sub')
      const a = main.getBoundingClientRect(), b = sub.getBoundingClientRect()
      return {separate:sub.parentElement===document.body,main:[a.left,a.right],sub:[b.left,b.right,b.top,b.bottom],scroll:main.scrollWidth,width:main.clientWidth,w:innerWidth,h:innerHeight}
    })()`)
    assert.equal(bounds.separate, true)
    assert.equal(bounds.scroll, bounds.width, 'submenu does not widen the main menu')
    assert.ok(bounds.sub[0] >= 0 && bounds.sub[1] <= bounds.w && bounds.sub[2] >= 0 && bounds.sub[3] <= bounds.h)
    assert.ok(side === 'right' ? bounds.sub[0] >= bounds.main[1] - 2 : bounds.sub[1] <= bounds.main[0] + 2)
    await move(await point('.ctxmenu--sub .ctxmenu__row'))
    assert.equal(await run(`!!document.querySelector('.ctxmenu--sub')`), true, 'mouse can cross into the floating menu')
    await shot('03-submenu-' + side)
    await click(await point('.ctxmenu--sub .ctxmenu__row'))
    assert.match(await text(), /^# 菜单测试/, 'submenu action actually runs')
    assert.equal(await run(`document.querySelectorAll('.ctxmenu').length`), 0)
  }
  await edit('键盘菜单', 0, 4)
  await move({ x: 700, y: 700 })
  await run(`document.querySelector('.cm-content').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:100}))`)
  await wait(100)
  for (let i = 0; i < 12; i++) {
    if (await run(`document.querySelector('.ctxmenu__row.is-active')?.getAttribute('aria-haspopup') === 'menu'`)) break
    await press('Down')
  }
  await press('Right')
  assert.equal(await run(`!!document.querySelector('.ctxmenu--sub')`), true)
  await press('Down')
  await press('Enter')
  assert.match(await text(), /^## 键盘菜单/)
  assert.deepEqual(errors, [])
  console.log('PASS: code fences, ordered typing, IME, caret, language detection/selection/undo/hover, prose after code, read-only, submenu mouse/keyboard and viewport edges')
  if (process.argv.includes('--manual')) { await edit(''); win.setTitle('MDView — Code input verification'); return }
  app.exit(0)
}
app.whenReady().then(main).catch(error => { console.error(error); app.exit(1) })
