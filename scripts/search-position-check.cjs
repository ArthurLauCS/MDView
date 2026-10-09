/** Check source offsets AND actual visible match geometry, using only document copies. */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const OUT = path.resolve(process.argv[2] || 'design-review/search-position')
const INPUT = process.argv[3]
require('node:fs').mkdirSync(OUT, {recursive:true})
app.setPath('userData', path.join(OUT,'profile'))
app.setPath('documents', OUT)
require(path.resolve(__dirname, '../out/main/index.js'))
const wait = ms => new Promise(resolve => setTimeout(resolve,ms))
const ctx = 'window.__mdview.editorContext()'
async function main() {
  for (let i=0;i<80&&!BrowserWindow.getAllWindows().length;i++) await wait(50)
  const win = BrowserWindow.getAllWindows()[0]
  // UI measurements must keep running when a developer switches to another window.
  win.webContents.setBackgroundThrottling(false)
  const errors=[]
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message)})
  const run = code => win.webContents.executeJavaScript(code,true)
  await wait(1200)
  const settings = async patch => { await run(`window.__mdview.setSettings(${JSON.stringify(patch)})`); await wait(150) }
  await settings({autoSave:false,historyEnabled:false,sidebarVisible:false,language:'zh-CN',motion:'off'})
  const press = async (keyCode, modifiers=[]) => {
    win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers})
    win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers})
    await wait(180)
  }
  const query = async text => {
    await run(`${ctx}.search('open')`)
    await run(`(()=>{const e=document.querySelector('.cm-search input[name=search]');e.focus();e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await wait(100)
  }
  let checks=0
  const geometry = async (text, from, occurrence=0) => run(`(()=>{
    const selected=${ctx}.selection
    const cell=[...document.querySelectorAll('[data-cell-from]')].find(el=>${from}>=Number(el.dataset.cellFrom)&&${from}<Number(el.dataset.cellTo))
    const element=cell||document.querySelector('.cm-searchMatch-selected')
    if(!element)return {selected,missing:true}
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[]
    while(walker.nextNode())nodes.push(walker.currentNode)
    const all=nodes.map(n=>n.data).join('')
    let index=-1
    for(let i=0;i<=${occurrence};i++)index=all.indexOf(${JSON.stringify(text)},index+1)
    let rect=element.getBoundingClientRect(), offset=0
    if(index>=0)for(const node of nodes){if(index<offset+node.length){const r=document.createRange();r.setStart(node,index-offset);r.setEnd(node,Math.min(node.length,index-offset+${text.length}));rect=r.getBoundingClientRect();break}offset+=node.length}
    const viewport=document.querySelector('.cm-scroller').getBoundingClientRect()
    const table=cell?.closest('.live-table')?.getBoundingClientRect()
    return {selected,found:index>=0,top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,viewport:{top:viewport.top,bottom:viewport.bottom,left:Math.max(viewport.left,table?.left??viewport.left),right:Math.min(viewport.right,table?.right??viewport.right)},focus:document.activeElement.name,table:!!cell}
  })()`)
  const verify = async (text, from, occurrence=0, visible=true, display=text) => {
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    let result
    for(let i=0;i<30;i++) {
      result=await geometry(display,from,occurrence)
      if(!result.missing&&result.top>=result.viewport.top-2&&result.bottom<=result.viewport.bottom+2&&result.left>=result.viewport.left-2&&result.right<=result.viewport.right+2)break
      await wait(50)
    }
    assert.deepEqual(result.selected,{start:from,end:from+text.length},'exact source match')
    if(visible)assert.ok(result.found,'the actual matched text is rendered')
    assert.ok(!result.missing&&result.top>=result.viewport.top-2&&result.bottom<=result.viewport.bottom+2,JSON.stringify(result))
    assert.ok(result.left>=result.viewport.left-2&&result.right<=result.viewport.right+2,JSON.stringify(result))
    assert.equal(result.focus,'search','navigation preserves search-field focus')
    assert.equal(await run('document.querySelectorAll(".live-cell-input").length'),0,'search never enters table editing')
    checks++
  }
  const load = async (name,text) => {
    await run(`${ctx}.search('close')`)
    const file=path.join(OUT,name+'.md')
    await fs.writeFile(file,text)
    await run(`window.__mdview.loadDocument(${JSON.stringify(file)})`)
    await wait(250)
    return text.replace(/\r\n?/g,'\n')
  }
  if(INPUT) {
    const report=await load('report',await fs.readFile(INPUT,'utf8'))
    const at=report.indexOf('R-080')
    assert.ok(at>=0,'supplied report contains R-080')
    for(const [width,height,size] of [[1280,840,17],[760,640,17],[1920,1000,22]]) {
      win.setSize(width,height)
      await settings({fontSize:size})
      await run(`${ctx}.select(0,0)`)
      await query('R-080')
      await press('Enter')
      await verify('R-080',at)
      await press('F3')
      await verify('R-080',at)
      await press('F3',['shift'])
      await verify('R-080',at)
      await settings({fontSize:size+2})
      await verify('R-080',at)
      await fs.writeFile(path.join(OUT,`report-${width}.png`),(await win.webContents.capturePage()).toPNG())
      if(width===1280) {
        win.webContents.sendInputEvent({type:'mouseWheel',x:400,y:400,deltaY:-1600,deltaX:0})
        await wait(300)
        await settings({fontSize:size})
        const manual=await geometry('R-080',at)
        assert.ok(manual.missing||manual.bottom<manual.viewport.top||manual.top>manual.viewport.bottom,'manual scrolling is not pulled back by later reflow')
        checks++
      }
      await run(`${ctx}.search('close')`)
    }
    console.log('PASS report R-080: exact row, forward/backward wrap, 3 window/font layouts')
  }
  const rows=Array.from({length:240},(_,i)=>`| row-${i} | ${[4,80,160,235].includes(i)?'needle':'普通内容'} | ${'换行内容 '.repeat(i%3+1)} |`).join('\n')
  const tall=Array.from({length:90},(_,i)=>[2,45,85].includes(i)?'needle':'line-'+i).join('<br>')
  const document='# Search positions\n\n'+ 'filler paragraph\n\n'.repeat(80)+'| ID | Text | Details |\n| --- | --- | --- |\n'+rows+`\n| tall | ${tall} | end |\n| link | [说明](./hidden-target.md) | end |\n\n`+'paragraph\n\n'.repeat(80)+'needle\n'
  const source=await load('synthetic',document)
  const matches=[...source.matchAll(/needle/g)].map(match=>match.index)
  for(const width of [1280,760]) {
    win.setSize(width,840)
    await settings({fontSize:17})
    await run(`${ctx}.select(0,0)`)
    await query('needle')
    for(let i=0;i<matches.length;i++) {
      await press('F3')
      await verify('needle',matches[i],i>=4&&i<=6?i-4:0)
    }
    await press('F3')
    await verify('needle',matches[0])
    await press('F3',['shift'])
    await verify('needle',matches.at(-1))
    for(let i=matches.length-2;i>=0;i--) {
      await run("document.querySelector('.cm-search button[name=prev]').click()")
      await wait(180)
      await verify('needle',matches[i],i>=4&&i<=6?i-4:0)
    }
    await run(`${ctx}.search('close')`)
  }
  await query('hidden-target.md')
  await press('F3')
  await verify('hidden-target.md',source.indexOf('hidden-target.md'),0,false)
  assert.equal(await sourceFromEditor(),source)
  const mixed = '# Hidden destinations\n\n| ID | Content |\n| --- | --- |\n| mixed | [needle](./needle.md)<br>' + 'filler<br>'.repeat(80) + 'needle |\n'
  const mixedSource = await load('mixed',mixed)
  await query('needle')
  const mixedHits = [...mixedSource.matchAll(/needle/g)].map(match=>match.index)
  for(let i=0;i<mixedHits.length;i++) {
    await press('F3')
    await verify('needle',mixedHits[i],i===2?1:0)
  }
  await fs.writeFile(path.join(OUT,'sample.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#496c82"/></svg>')
  const imageSource=await load('image','# Image path\n\n| Content |\n| --- |\n| '+ 'line<br>'.repeat(80) +'![picture](./sample.svg) |\n')
  await query('sample.svg')
  await press('F3')
  await wait(200)
  const image=await run(`(()=>{const image=document.querySelector('.live-table img');const r=image.getBoundingClientRect(),v=document.querySelector('.cm-scroller').getBoundingClientRect();return {loaded:image.naturalWidth>0,top:r.top,bottom:r.bottom,start:v.top,end:v.bottom,selection:${ctx}.selection}})()`)
  assert.ok(image.loaded&&image.top>=image.start&&image.bottom<=image.end,JSON.stringify(image))
  assert.deepEqual(image.selection,{start:imageSource.indexOf('sample.svg'),end:imageSource.indexOf('sample.svg')+10})
  checks++
  const columns=Array.from({length:16},(_,i)=>'column-'+i)
  const wide=await load('wide','# Wide table\n\n| '+columns.join(' | ')+' |\n| '+columns.map(()=>'---').join(' | ')+' |\n| '+columns.slice(0,-1).join(' | ')+' | right-target |\n')
  await query('right-target')
  await press('F3')
  await verify('right-target',wide.indexOf('right-target'))
  assert.ok(await run('document.querySelector(".live-table").scrollLeft')>0,'wide-table matches scroll horizontally')
  await load('synthetic',source)
  await run(`${ctx}.search('close')`)
  await settings({readOnly:true})
  await query('row-235')
  await press('F3')
  await verify('row-235',source.indexOf('row-235'))
  assert.equal(await sourceFromEditor(),source)
  async function sourceFromEditor(){return run(`${ctx}.source`)}
  assert.deepEqual(errors,[],'renderer errors')
  await fs.writeFile(path.join(OUT,'results.json'),JSON.stringify({checks,status:'PASS'},null,2))
  console.log(`PASS ${checks} search jumps: source offsets, visible text geometry, tables taller than viewport, repeated hits in a cell, forward/backward wrap, hidden paths and read-only`)
  app.quit()
}
app.whenReady().then(()=>main().catch(error=>{console.error(error);app.exit(1)}))
