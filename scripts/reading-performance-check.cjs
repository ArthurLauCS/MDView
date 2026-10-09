/** Real-document timings and layout checks, always using copies and an isolated profile. */
const { app, BrowserWindow, contentTracing } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const OUT = path.resolve(process.argv[2] || 'design-review/round-reading')
const INPUT = process.argv[3]
const baseline = process.argv.includes('--baseline')
require('node:fs').mkdirSync(OUT, { recursive: true })
app.setPath('userData', path.join(OUT, 'profile'))
app.setPath('documents', OUT)
require(path.resolve(__dirname, '../out/main/index.js'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await wait(100)
  const win = BrowserWindow.getAllWindows()[0]
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) console.error(message) })
  const run = code => win.webContents.executeJavaScript(code, true).catch(error => { console.error(code.slice(0, 250)); throw error })
  const until = async code => {
    for (let i = 0; i < 200; i++) { if (await run(code)) return; await wait(50) }
    throw new Error('Timed out: ' + code)
  }
  await until('!!window.__mdview')
  await wait(1200)
  win.setSize(1440, 1000)
  await run(`window.__mdview.setSettings({language:'zh-CN',theme:'dark',autoSave:false,historyEnabled:false,sidebarVisible:false,motion:'off'})`)
  if (process.argv.includes('--trace')) await contentTracing.startRecording({included_categories:['devtools.timeline','disabled-by-default-devtools.timeline','v8']})
  const source = INPUT ? await fs.readFile(INPUT, 'utf8') : '# 阅读检查\n\n' + '### 小节\n- **位置**：正文与 `code`。\n- **证据**：长行说明。\n\n'.repeat(350)
  const file = path.join(OUT, 'reading.md')
  await fs.writeFile(file, source)
  const metrics = { bytes: Buffer.byteLength(source), lines: source.split('\n').length }
  let started = performance.now()
  await run(`window.__mdview.loadDocument(${JSON.stringify(file)})`)
  await until('!!document.querySelector(".live-h1")')
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  metrics.openMs = performance.now() - started
  await run('document.fonts.ready.then(() => true)')
  const shot = async name => fs.writeFile(path.join(OUT, name + '.png'), (await win.webContents.capturePage()).toPNG())
  const section = await run(`window.__mdview.editorContext().source.indexOf('## P0')`)
  if (section >= 0) await run(`window.__mdview.editorContext().jump(${section + 3})`)
  await wait(300)
  await shot('01-report-dark')
  await run(`window.__mdview.setSettings({theme:'light'})`)
  await wait(150)
  await shot('02-report-light')
  await run(`window.__mdview.setSettings({theme:'dark'})`)
  const meta = await run(`window.mdview.doc.read(${JSON.stringify(file)}).then(d=>d.meta)`)
  for (let i = 0; i < 25; i++) {
    await run(`window.mdview.history.record(${JSON.stringify(meta.id)}, ${JSON.stringify(source + '\n版本 ')} + ${i}, 'manual')`)
  }
  started = performance.now()
  await run(`window.__mdview.openPanel('history')`)
  await until('document.querySelectorAll(".hist__row").length === 25 && !!document.querySelector(".diff__row")')
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  metrics.historyOpenMs = performance.now() - started
  started = performance.now()
  await run(`document.querySelectorAll('.hist__row')[24].click()`)
  await until('document.querySelectorAll(".diff__row--add").length > 100')
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  metrics.oldestRevisionMs = performance.now() - started
  const drag = async () => {
    const point = await run(`(() => {const r=document.querySelector('.side-resizer--right').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+180)}})()`)
    await run(`(() => {window.__frames=[]; window.__measuring=true; let prev=performance.now(); const frame=now=>{window.__frames.push(now-prev);prev=now;if(window.__measuring)requestAnimationFrame(frame)};requestAnimationFrame(frame)})()`)
    win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1})
    for (let i = 1; i <= 40; i++) {
      win.webContents.sendInputEvent({type:'mouseMove',x:point.x-Math.round(100*Math.sin(i/40*Math.PI)),y:point.y,modifiers:['leftButtonDown']})
      await wait(16)
    }
    win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1})
    const result = await run(`(() => {window.__measuring=false;const a=window.__frames.slice(2).sort((a,b)=>a-b);return {frames:a.length,p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)}})()`)
    await wait(50)
    return result
  }
  metrics.diffDrag = await drag()
  if (process.argv.includes('--trace')) await contentTracing.stopRecording(path.join(OUT, 'trace.json'))
  await shot('03-history-diff')
  await run(`Array.from(document.querySelectorAll('.hist__detail-head button')).find(b=>b.textContent==='全文').click()`)
  await until('!!document.querySelector(".hist__source")?.textContent')
  assert.equal(await run(`document.querySelector('.hist__source').textContent`), source + '\n版本 0')
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  metrics.textDrag = await drag()
  await shot('04-history-text')
  await run(`document.querySelector('.history-dock__toggle').click()`)
  await wait(100)
  // Keep geometry checks small enough that all relevant lines fit in one viewport.
  const layoutFile = path.join(OUT, 'layout.md')
  const layout = '# 阅读布局\n\n## 层级与留白\n\n### 列表小节\n- 第一层内容较长，用来检查换行后仍然与正文对齐。\n  - 第二层内容\n    - 第三层内容\n\n---\n\n![独立图片](./sample.svg)\n\n正文中的 ![行内图片](./sample.svg) 继续排列。\n'
  await fs.writeFile(path.join(OUT, 'sample.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80"><rect width="220" height="80" fill="#496c82"/></svg>')
  await fs.writeFile(layoutFile, layout)
  await run(`window.__mdview.loadDocument(${JSON.stringify(layoutFile)})`)
  await until('!!document.querySelector(".live-rendered img")?.naturalWidth')
  if (!baseline) {
    const geometry = await run(`(() => {const lines=[...document.querySelectorAll('.live-list')];const line=document.querySelector('.live-image-line');const image=line.querySelector('.live-rendered img');const a=line.getBoundingClientRect(),b=image.getBoundingClientRect();return {indent:lines.map(el=>parseFloat(getComputedStyle(el).paddingLeft)),center:Math.abs((a.left+a.right-b.left-b.right)/2),padding:parseFloat(getComputedStyle(line).paddingTop)}})()`)
    assert.ok(geometry.indent[0] < geometry.indent[1] && geometry.indent[1] < geometry.indent[2], JSON.stringify(geometry))
    assert.ok(geometry.center < 2 && geometry.padding >= 20, JSON.stringify(geometry))
    assert.ok(await run(`(() => {const rule=document.querySelector('.live-rule hr');const r=rule.getBoundingClientRect();return r.width > document.querySelector('.live-rule').clientWidth*.95 && r.height >= 1 && getComputedStyle(rule).backgroundColor !== 'rgba(0, 0, 0, 0)'})()`), 'the separator is a visible full-width rule')
  }
  await shot('05-layout-dark')
  win.setSize(760, 900)
  await wait(200)
  await shot('06-layout-narrow')
  assert.equal(await fs.readFile(file, 'utf8'), source)
  await fs.writeFile(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2))
  console.log(JSON.stringify(metrics, null, 2))
  app.quit()
}
app.whenReady().then(() => main().catch(error => {console.error(error);app.exit(1)}))
