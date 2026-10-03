import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  AssetRef,
  DocumentContent,
  DocumentMeta,
  ExportMode,
  ExportPreview,
  InsertedAsset,
  WorkspaceInfo
} from '@shared/types'

const api = {
  window: {
    minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
    toggleMaximize: () => ipcRenderer.send(IPC.WINDOW_TOGGLE_MAXIMIZE),
    close: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED)
  },
  workspace: {
    openDialog: (): Promise<WorkspaceInfo | null> => ipcRenderer.invoke(IPC.WORKSPACE_OPEN),
    openPath: (path: string): Promise<WorkspaceInfo> =>
      ipcRenderer.invoke(IPC.WORKSPACE_OPEN_PATH, path),
    tree: (): Promise<WorkspaceInfo | null> => ipcRenderer.invoke(IPC.WORKSPACE_TREE)
  },
  doc: {
    read: (path: string): Promise<DocumentContent> => ipcRenderer.invoke(IPC.DOC_READ, path),
    write: (path: string, text: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.DOC_WRITE, path, text),
    create: (dir: string, stem: string, withAssetFolder: boolean): Promise<DocumentMeta> =>
      ipcRenderer.invoke(IPC.DOC_CREATE, dir, stem, withAssetFolder),
    rename: (path: string, nextStem: string): Promise<DocumentMeta> =>
      ipcRenderer.invoke(IPC.DOC_RENAME, path, nextStem),
    remove: (path: string): Promise<boolean> => ipcRenderer.invoke(IPC.DOC_DELETE, path)
  },
  asset: {
    fromClipboard: (docPath: string): Promise<InsertedAsset | null> =>
      ipcRenderer.invoke(IPC.ASSET_FROM_CLIPBOARD, docPath),
    fromFiles: (docPath: string, paths: string[]): Promise<InsertedAsset[]> =>
      ipcRenderer.invoke(IPC.ASSET_FROM_FILES, docPath, paths),
    /**
     * Electron 32 deprecated `File.path` and 33 removed it. `webUtils` is the
     * supported replacement, and it only exists in the preload, so resolving
     * a dropped file to a real path has to happen on this side of the bridge.
     */
    pathForFile: (file: File): string | null => {
      try {
        return webUtils.getPathForFile(file) || null
      } catch {
        return null
      }
    },
    /** Drag payloads whose bytes only exist in the renderer (rare, but real). */
    saveBuffer: (docPath: string, name: string, bytes: Uint8Array): Promise<InsertedAsset> =>
      ipcRenderer.invoke(IPC.ASSET_SAVE_BUFFER, docPath, name, bytes),
    list: (docPath: string, text: string): Promise<AssetRef[]> =>
      ipcRenderer.invoke(IPC.ASSET_LIST, docPath, text),
    orphans: (): Promise<string[]> => ipcRenderer.invoke(IPC.ASSET_ORPHANS),
    dataUrl: (path: string): Promise<string> => ipcRenderer.invoke(IPC.ASSET_READ_DATA_URL, path),
    reveal: (path: string) => ipcRenderer.send(IPC.ASSET_REVEAL, path)
  },
  export: {
    preview: (mode: ExportMode, docPath: string, text: string): Promise<ExportPreview> =>
      ipcRenderer.invoke(IPC.EXPORT_PREVIEW, mode, docPath, text),
    run: (mode: ExportMode, docPath: string, text: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.EXPORT_RUN, mode, docPath, text)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    patch: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:patch', patch)
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url)
  },
  clipboard: {
    writeText: (text: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.CLIPBOARD_WRITE_TEXT, text),
    writeImage: (path: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.CLIPBOARD_WRITE_IMAGE, path)
  },
  dialog: {
    openImages: (): Promise<string[] | null> => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE)
  }
}

export type MdViewApi = typeof api

contextBridge.exposeInMainWorld('mdview', api)
