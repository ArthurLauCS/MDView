import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerAllHandlers } from './ipc/registry'
import { documentArg } from './services/launch'
import { WorkspaceService } from './services/workspace'
import { DocumentService } from './services/documents'
import { AssetService } from './services/assets'
import { SettingsService } from './services/settings'
import { HistoryService } from './services/history'
import { SessionService } from './services/session'

const isDev = !app.isPackaged

// Preserve existing settings, sessions and history after the product rename.
if (app.getPath('userData') === join(app.getPath('appData'), app.getName())) {
  app.setPath('userData', join(app.getPath('appData'), 'mdview'))
}

let openWindow: (path: string | null, fragment?: string, restore?: boolean) => void

// Windows share the history writer while keeping their own document state.
const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()

app.on('second-instance', (_event, argv, cwd) => {
  void app.whenReady().then(() => openWindow(documentArg(argv, cwd)))
})

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

  // The renderer owns all commands; Electron's default menu steals bindings
  // such as Ctrl+Shift+I and Ctrl+Shift+W before they reach the editor.
  win.removeMenu()
  win.once('ready-to-show', () => win.show())

  // Never let a document navigate the shell away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
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
  if (!primary) return
  registerAssetProtocol()

  const userData = app.getPath('userData')
  const settings = new SettingsService(userData, app.getLocale().startsWith('zh') ? 'zh-CN' : 'en')
  const documents = new DocumentService()
  const history = new HistoryService(userData)
  openWindow = (path, fragment = '', restore = false) => {
    const win = createWindow()
    const workspace = new WorkspaceService()
    registerAllHandlers({
      getWindow: () => win,
      openWindow,
      launch: { path, fragment },
      settings,
      workspace,
      documents,
      assets: new AssetService(workspace, documents, settings),
      history,
      session: new SessionService(userData, restore)
    })
  }
  openWindow(documentArg(process.argv, process.cwd()), '', true)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow(null)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
