import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerAllHandlers } from './ipc/registry'
import { WorkspaceService } from './services/workspace'
import { DocumentService } from './services/documents'
import { AssetService } from './services/assets'
import { SettingsService } from './services/settings'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 520,
    show: false,
    // Custom titlebar — the renderer draws its own chrome.
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1F1E1D',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Needed by the renderer to paste bitmaps without a round trip per frame.
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Never let a document navigate the shell away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const settings = new SettingsService(app.getPath('userData'))
  const workspace = new WorkspaceService()
  const documents = new DocumentService(settings)
  const assets = new AssetService(workspace, documents)

  mainWindow = createWindow()
  registerAllHandlers({
    getWindow: () => mainWindow,
    settings,
    workspace,
    documents,
    assets
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
