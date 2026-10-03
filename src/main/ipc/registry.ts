import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { IPC } from '@shared/ipc'
import { previewPlainMd } from '../services/export'
import { diffLines, summarise } from '../services/history'
import type { SettingsService } from '../services/settings'
import type { WorkspaceService } from '../services/workspace'
import type { DocumentService } from '../services/documents'
import type { AssetService } from '../services/assets'
import type { HistoryService } from '../services/history'
import type { SessionService } from '../services/session'
import type { AppSettings, ExportMode } from '@shared/types'

export interface HandlerContext {
  getWindow: () => BrowserWindow | null
  settings: SettingsService
  workspace: WorkspaceService
  documents: DocumentService
  assets: AssetService
  history: HistoryService
  session: SessionService
}

const IMAGE_FILTER: Electron.FileFilter[] = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }
]

export function registerAllHandlers(ctx: HandlerContext): void {
  const { getWindow, settings, workspace, documents, assets, history, session } = ctx

  // ---- window chrome ------------------------------------------------------
  ipcMain.on(IPC.WINDOW_MINIMIZE, () => getWindow()?.minimize())
  ipcMain.on(IPC.WINDOW_CLOSE, () => getWindow()?.close())
  ipcMain.on(IPC.WINDOW_TOGGLE_MAXIMIZE, () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, () => getWindow()?.isMaximized() ?? false)

  // ---- workspace ----------------------------------------------------------
  ipcMain.handle(IPC.WORKSPACE_OPEN, async () => {
    const win = getWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '打开文档目录'
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return workspace.open(res.filePaths[0])
  })

  ipcMain.handle(IPC.WORKSPACE_OPEN_PATH, (_e, path: string) => workspace.open(path))
  ipcMain.handle(IPC.WORKSPACE_TREE, () => workspace.current)

  // ---- documents ----------------------------------------------------------
  ipcMain.handle(IPC.DOC_READ, (_e, path: string) => documents.read(path))
  ipcMain.handle(IPC.DOC_WRITE, async (_e, path: string, text: string) => {
    await documents.write(path, text)
    return true
  })
  ipcMain.handle(IPC.DOC_CREATE, (_e, dir: string, stem: string, withAssetFolder: boolean) =>
    documents.create(dir, stem, withAssetFolder)
  )
  ipcMain.handle(IPC.DOC_RENAME, (_e, path: string, nextStem: string) =>
    documents.rename(path, nextStem)
  )
  ipcMain.handle(IPC.DOC_DELETE, async (_e, path: string) => {
    await shell.trashItem(path)
    return true
  })

  // ---- assets -------------------------------------------------------------
  ipcMain.handle(IPC.ASSET_FROM_CLIPBOARD, async (_e, docPath: string) => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    return assets.insert(docPath, img.toPNG(), null, '.png')
  })

  ipcMain.handle(IPC.ASSET_FROM_FILES, async (_e, docPath: string, paths: string[]) => {
    const inserted = []
    for (const p of paths) {
      if (extname(p).toLowerCase() === '.md') continue
      inserted.push(await assets.insertFromPath(docPath, p))
    }
    return inserted
  })

  ipcMain.handle(
    IPC.ASSET_SAVE_BUFFER,
    (_e, docPath: string, name: string, bytes: Uint8Array) =>
      assets.insert(docPath, Buffer.from(bytes), name, extname(name).toLowerCase() || '.png')
  )

  ipcMain.handle(IPC.ASSET_LIST, (_e, docPath: string, text: string) =>
    assets.refs(docPath, text)
  )
  ipcMain.handle(IPC.ASSET_ORPHANS, () => assets.orphans())
  ipcMain.handle(IPC.ASSET_READ_DATA_URL, (_e, path: string) => assets.readDataUrl(path))
  ipcMain.on(IPC.ASSET_REVEAL, (_e, path: string) => shell.showItemInFolder(path))

  // ---- export -------------------------------------------------------------
  ipcMain.handle(IPC.EXPORT_PREVIEW, (_e, mode: ExportMode, docPath: string, text: string) =>
    previewPlainMd(docPath, text, settings.get(), mode)
  )

  ipcMain.handle(IPC.EXPORT_RUN, async (_e, mode: ExportMode, docPath: string, text: string) => {
    const win = getWindow()
    if (!win) return null

    if (mode === 'plain-md') {
      const preview = await previewPlainMd(docPath, text, settings.get(), mode)
      const res = await dialog.showSaveDialog(win, {
        title: '导出为纯 Markdown',
        defaultPath: preview.targetPath
      })
      if (res.canceled || !res.filePath) return null
      await fs.writeFile(res.filePath, preview.output, 'utf8')
      return res.filePath
    }

    throw new Error(`export mode not implemented yet: ${mode}`)
  })

  // ---- shell + clipboard --------------------------------------------------
  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_e, url: string) => shell.openExternal(url))

  ipcMain.handle(IPC.CLIPBOARD_WRITE_TEXT, (_e, text: string) => {
    clipboard.writeText(text)
    return true
  })

  ipcMain.handle(IPC.CLIPBOARD_WRITE_IMAGE, async (_e, path: string) => {
    const img = nativeImage.createFromPath(path)
    if (img.isEmpty()) return false
    clipboard.writeImage(img)
    return true
  })

  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async () => {
    const win = getWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: IMAGE_FILTER
    })
    return res.canceled ? null : res.filePaths
  })

  // ---- history ------------------------------------------------------------
  ipcMain.handle(IPC.HISTORY_LIST, (_e, docId: string) => history.list(docId))
  ipcMain.handle(IPC.HISTORY_READ, (_e, docId: string, revId: string) =>
    history.read(docId, revId)
  )
  ipcMain.handle(
    IPC.HISTORY_RECORD,
    (_e, docId: string, text: string, kind: 'auto' | 'manual' | 'restore') =>
      history.record(docId, text, kind, { minGapMs: kind === 'auto' ? 20_000 : 0 })
  )
  ipcMain.handle(IPC.HISTORY_FORGET, (_e, docId: string, revId: string) =>
    history.forget(docId, revId)
  )
  ipcMain.handle(IPC.HISTORY_CLEAR, async (_e, docId: string) => {
    await history.clear(docId)
    return true
  })
  ipcMain.handle(IPC.HISTORY_DIFF, async (_e, docId: string, a: string, b: string) => {
    const [before, after] = await Promise.all([
      a === '' ? Promise.resolve('') : history.read(docId, a),
      b === '' ? Promise.resolve('') : history.read(docId, b)
    ])
    if (before === null || after === null) return null
    return summarise(diffLines(before, after))
  })

  // ---- session ------------------------------------------------------------
  ipcMain.handle(IPC.SESSION_LOAD, async () => {
    const state = await session.load()
    // Report first-run once, then never again.
    const firstRun = session.isFirstRun()
    if (firstRun) await session.markRun()
    return { ...state, firstRun }
  })
  ipcMain.handle(IPC.SESSION_SAVE, async (_e, state: unknown) => {
    await session.save(state as never)
    if (state && typeof state === 'object' && 'workspaceRoot' in state) {
      const root = (state as { workspaceRoot: string | null }).workspaceRoot
      if (root) await session.rememberRoot(root)
    }
    return true
  })
  ipcMain.handle(IPC.SESSION_RECENT, () => session.recentRoots())

  // ---- bundled documents --------------------------------------------------
  /**
   * Where the bundled documents live.
   *
   * Resolved from the compiled main file rather than `app.getAppPath()`: that
   * returns the directory of whatever entry script was launched, which is the
   * app root in a packaged build but can be anywhere in development or under
   * a harness. `__dirname` is `out/main`, so the app root is two levels up.
   */
  const stockRoot = (): string =>
    app.isPackaged
      ? join(process.resourcesPath, 'stock')
      : join(__dirname, '..', '..', 'stock')

  ipcMain.handle(IPC.APP_REVEAL_STOCK, (_e, name: string) => {
    const target = join(stockRoot(), name)
    if (!existsSync(target)) return null
    shell.showItemInFolder(target)
    return target
  })

  /**
   * Make a bundled document usable as a real document.
   *
   * It cannot be opened where it lives: a packaged app's resources directory
   * is read-only, and the document needs writable space for the images the
   * user will add. So the whole folder — markdown and its images together —
   * is copied into the user's documents the first time it is asked for, and
   * left alone on every later request.
   */
  ipcMain.handle(IPC.APP_RESOLVE_STOCK, async (_e, name: string) => {
    const source = join(stockRoot(), name)
    if (!existsSync(source)) return null

    const destRoot = join(app.getPath('documents'), 'MDView')
    const target = join(destRoot, name)
    if (existsSync(target)) return target

    // Copy the containing folder rather than the file alone: the document's
    // images live in a sibling folder, and the pair is the unit that travels.
    const relDir = relative(stockRoot(), source).replace(/[\\/][^\\/]+$/, '')
    await fs.mkdir(destRoot, { recursive: true })
    if (relDir && relDir !== '.') {
      await fs.cp(join(stockRoot(), relDir), join(destRoot, relDir), { recursive: true })
    } else {
      await fs.mkdir(dirname(target), { recursive: true })
      await fs.copyFile(source, target)
    }
    return existsSync(target) ? target : null
  })

  // ---- settings -----------------------------------------------------------
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:patch', (_e, patch: Partial<AppSettings>) => settings.patch(patch))
}
