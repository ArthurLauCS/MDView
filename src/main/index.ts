import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerAllHandlers } from './ipc/registry'
import { WorkspaceService } from './services/workspace'
import { DocumentService } from './services/documents'
import { AssetService } from './services/assets'
import { SettingsService } from './services/settings'
import { HistoryService } from './services/history'
import { SessionService } from './services/session'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

/**
 * A scheme for serving documents' own images.
 *
 * The renderer runs with a strict CSP, so a `file://` image referenced from a
 * document outside the app bundle is blocked as cross-origin — which is every
 * image in every user document. Serving them through a registered scheme with
 * `standard: true, secure: true` keeps the CSP meaningful while letting the
 * document load what it legitimately owns.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mdasset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function registerAssetProtocol(): void {
  protocol.handle('mdasset', (request) => {
    try {
      const url = new URL(request.url)
      // `mdasset://local/<encoded absolute path>` — the host is a fixed
      // placeholder so the path survives intact.
      const target = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const resolved = normalize(target)
      // Refuse anything that is not a plain absolute path: this handler is
      // reachable from any markup a document can contain.
      if (!resolved.includes(sep) || resolved.includes('\0')) {
        return new Response('bad path', { status: 400 })
      }
      return net.fetch(pathToFileURL(resolved).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

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
  registerAssetProtocol()

  const userData = app.getPath('userData')
  const settings = new SettingsService(userData)
  const workspace = new WorkspaceService()
  const documents = new DocumentService(settings)
  const assets = new AssetService(workspace, documents, settings)
  const history = new HistoryService(userData)
  const session = new SessionService(userData)

  mainWindow = createWindow()
  registerAllHandlers({
    getWindow: () => mainWindow,
    settings,
    workspace,
    documents,
    assets,
    history,
    session
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
