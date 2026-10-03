/** Rasterise build/icon.svg to build/icon.png; electron-builder derives the .ico from it. */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const BUILD = path.resolve(__dirname, '..', 'build')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('about:blank')
  const svg = fs.readFileSync(path.join(BUILD, 'icon.svg')).toString('base64')
  const png = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 })
      canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = reject
    image.src = 'data:image/svg+xml;base64,${svg}'
  })`)
  fs.writeFileSync(path.join(BUILD, 'icon.png'), Buffer.from(png.split(',')[1], 'base64'))
  app.quit()
})
