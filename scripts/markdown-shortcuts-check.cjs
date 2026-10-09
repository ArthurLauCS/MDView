/** Real keyboard/character events against an isolated document; never touches user files. */
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const OUT = path.resolve(process.argv[2] || 'design-review/markdown-shortcuts')
require('node:fs').mkdirSync(OUT, { recursive: true })
app.setPath('userData', path.join(OUT, 'profile'))
app.setPath('documents', OUT)
dialog.showMessageBox = async () => ({ response: 1 })
require(path.resolve(__dirname, '../out/main/index.js'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const ctx = 'window.__mdview.editorContext()'
async function main() {
  for (let i = 0; i < 80 && !BrowserWindow.getAllWindows().length; i++) await wait(50)
  const win = BrowserWindow.getAllWindows()[0]
  win.setSize(1280, 900)
  const run = code => win.webContents.executeJavaScript(code, true).catch(error => { console.error(code); throw error })
  for (let i = 0; i < 80 && !await run('!!window.__mdview'); i++) await wait(50)
  await wait(1000)
  await run(`window.__mdview.setSettings({autoSave:false,historyEnabled:false,autoPair:true,smartLists:true,sidebarVisible:false,motion:'off',typewriterMode:false})`)
  const press = async binding => {
    const parts = binding.split('+'), keyCode = parts.pop()
    const modifiers = parts.map(p => ({ Ctrl:'control', Shift:'shift', Alt:'alt' })[p])
    win.webContents.sendInputEvent({ type:'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type:'keyUp', keyCode, modifiers })
    await wait(100)
  }
  const type = async text => {
    for (const keyCode of text) win.webContents.sendInputEvent({ type:'char', keyCode })
    await wait(70)
  }
  const edit = async (source, from = source.length, to = from) => {
    await run(`${ctx}.replace(0,${ctx}.source.length,${JSON.stringify(source)}); ${ctx}.select(${from},${to})`)
    await wait(100)
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    assert.deepEqual(await run(`${ctx}.selection ?? {start:${ctx}.cursor,end:${ctx}.cursor}`), { start:from,end:to }, 'fixture selection must survive layout')
  }
  const source = () => run(`${ctx}.source`)
  const prose = [
    ['复审：保留',0,3], ['复审： 保留',0,4], ['复审:保留',0,3], ['Review:keep',0,7],
    ['前（保留）后',1,5], ['前，后',1,2], ['前：保留',1,4], ['hello world!',6,12],
    ['  word  ',0,8], ['中文English123混排',2,12], ['emoji🙂next',5,7],
    ['日本語：保持',0,4], ['한국어：유지',0,4], ['café déjà vu',0,4], ['a\tword\tb',1,7],
    ['(word)',1,5], ['word.',0,4], ['hello *world*',0,13], ['**word**',2,6]
  ]
  let checks = 0
  for (const [key, selector] of [['Ctrl+B','.live-strong'], ['Ctrl+I','.live-em'], ['Ctrl+U','.live-underline'], ['Ctrl+Alt+S','.live-strike'], ['Ctrl+Shift+H','.live-mark']]) {
    for (const [text, from, to] of prose) {
      // A second bold command intentionally removes existing bold.
      if (key === 'Ctrl+B' && text === '**word**') continue
      await edit(text, from, to)
      await press(key)
      const formatted = await source()
      assert.notEqual(formatted, text, `${key}: ${text}`)
      assert.ok(await run(`!!document.querySelector(${JSON.stringify(selector)})`), `${key} preview: ${formatted}`)
      const selected = await run(`${ctx}.selection`)
      assert.equal(formatted.slice(selected.start, selected.end), text.slice(from,to).trim(), `${key} selection`)
      await press('Ctrl+Z')
      assert.equal(await source(), text, `${key} undo`)
      await press('Ctrl+Y')
      assert.equal(await source(), formatted, `${key} redo`)
      await run(`${ctx}.select(${selected.start},${selected.end})`)
      await press(key)
      assert.equal(await source(), text, `${key} toggle`)
      checks++
    }
  }
  for (const text of ['a`b', '``', 'a``b`c', ' spaced ', '中文`代码`', 'const x = "a_b"']) {
    await edit(text, 0, text.length)
    await press('Ctrl+E')
    assert.ok(await run('!!document.querySelector(".live-code")'), `code preview: ${await source()}`)
    const visible = await run('document.querySelector(".cm-content").textContent')
    assert.equal(visible, text, 'padding and delimiters must stay hidden')
    await press('Ctrl+E')
    assert.equal(await source(), text)
    checks++
  }
  for (const key of ['Ctrl+B','Ctrl+I','Ctrl+U','Ctrl+Alt+S','Ctrl+Shift+H','Ctrl+E']) {
    const text = 'first\n\n中文： 保留\nlast'
    await edit(text, 0, text.length)
    await press(key)
    assert.notEqual(await source(), text)
    await press(key)
    assert.equal(await source(), text, `multiline ${key}`)
    await edit('ab', 1)
    await press(key)
    await type('X')
    assert.ok(await run('!!document.querySelector(".live-strong,.live-em,.live-underline,.live-strike,.live-mark,.live-code")'), `empty selection ${key}`)
    checks += 2
  }
  for (const marker of ['---','-'.repeat(200),'***','___','* * *','  - - -']) {
    for (const nextLine of [false,true]) {
      const text = 'before\n\n' + marker + '\n\nafter'
      await edit(text, 8 + marker.length + Number(nextLine))
      await press('Backspace')
      assert.equal(await source(), 'before\n\n\nafter', `${marker.slice(0,10)} deletion`)
      await press('Ctrl+Z')
      assert.equal(await source(), text, 'rule deletion undo')
      checks++
    }
  }
  for (const text of ['heading\n---', '```md\n---\n```', '---\ntitle: x\n---', '    ---', 'text---']) {
    const from = text.lastIndexOf('---') + 3
    await edit(text, from)
    await press('Backspace')
    assert.equal(await source(), text.slice(0,from-1)+text.slice(from), `literal separator: ${text}`)
    checks++
  }
  for (const key of ['Ctrl+Shift+1','Ctrl+Shift+8','Ctrl+Shift+7','Ctrl+Shift+9','Ctrl+Shift+U']) {
    await edit('first\nsecond',0,6)
    await press(key)
    assert.ok((await source()).endsWith('\nsecond'), `${key} must not touch next line`)
    checks++
  }
  const long = '# Long document\n\n' + '普通正文 content\n\n'.repeat(400) + 'tail '
  for (const ch of ['_', '*', '~', '(']) {
    await edit(long)
    await wait(200)
    await run(`${ctx}.jump(${long.length})`)
    await wait(150)
    const top = await run('document.querySelector(".cm-scroller").scrollTop')
    assert.ok(top > 1000, JSON.stringify(await run(`({top:${top},height:document.querySelector('.cm-scroller').scrollHeight,client:document.querySelector('.cm-scroller').clientHeight,cursor:${ctx}.cursor,length:${ctx}.source.length,focus:document.activeElement.tagName})`)))
    await type(ch)
    assert.equal(await source(), long + (ch === '(' ? '()' : ch))
    const after = await run('document.querySelector(".cm-scroller").scrollTop')
    assert.ok(Math.abs(after-top) < 100, `no scroll jump on ${ch}: ${top} -> ${after}`)
    await press('Ctrl+Z')
    assert.equal(await source(), long)
    checks++
  }
  for (const text of ['snake_case','don\'t', '***', '___', '~~~~']) {
    await edit('')
    await type(text)
    assert.equal(await source(), text, `literal typing ${text}`)
    checks++
  }
  await edit('`a_b`', 2)
  await type('_')
  assert.equal(await source(), '`a__b`', 'inline code must not auto-pair')
  await edit('复审：保留', 0, 3)
  await press('Ctrl+B')
  await fs.writeFile(path.join(OUT, 'partial-bold.png'), (await win.webContents.capturePage()).toPNG())
  await run('window.__mdview.setSettings({readOnly:true})')
  const readonly = await source()
  await press('Ctrl+B')
  await press('Backspace')
  await type('_')
  assert.equal(await source(), readonly, 'read-only text remains unchanged')
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify({ checks: checks + 2, status:'PASS' }, null, 2))
  console.log(`PASS ${checks + 2} Markdown text/shortcut cases with preview, selection, undo/redo and scroll assertions`)
  app.quit()
}
app.whenReady().then(() => main().catch(error => { console.error(error); app.exit(1) }))
