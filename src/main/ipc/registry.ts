import { BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { IPC } from '@shared/ipc'
import { previewPlainMd } from '../services/export'
import type { SettingsService } from '../services/settings'
import type { WorkspaceService } from '../services/workspace'
import type { DocumentService } from '../services/documents'
import type { AssetService } from '../services/assets'
import type { AppSettings, ExportMode } from '@shared/types'

export interface HandlerContext {
  getWindow: () => BrowserWindow | null
  settings: SettingsService
  workspace: WorkspaceService
  documents: DocumentService
  assets: AssetService
}

const IMAGE_FILTER: Electron.FileFilter[] = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }
]

export function registerAllHandlers(ctx: HandlerContext): void {
  const { getWindow, settings, workspace, documents, assets } = ctx

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

  // ---- settings -----------------------------------------------------------
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:patch', (_e, patch: Partial<AppSettings>) => settings.patch(patch))
}
