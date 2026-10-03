/**
 * Single source of truth for every IPC channel name.
 * Main and preload both import from here, so a typo is a compile error.
 */
export const IPC = {
  // ---- window / app shell -------------------------------------------------
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZE_CHANGED: 'window:maximize-changed',

  // ---- workspace ----------------------------------------------------------
  WORKSPACE_OPEN: 'workspace:open',
  WORKSPACE_OPEN_PATH: 'workspace:open-path',
  WORKSPACE_TREE: 'workspace:tree',
  WORKSPACE_TREE_CHANGED: 'workspace:tree-changed',
  WORKSPACE_RECENT: 'workspace:recent',

  // ---- documents ----------------------------------------------------------
  DOC_READ: 'doc:read',
  DOC_WRITE: 'doc:write',
  DOC_CREATE: 'doc:create',
  DOC_RENAME: 'doc:rename',
  DOC_DELETE: 'doc:delete',
  DOC_MOVE: 'doc:move',
  DOC_CHANGED_ON_DISK: 'doc:changed-on-disk',

  // ---- assets -------------------------------------------------------------
  ASSET_FROM_CLIPBOARD: 'asset:from-clipboard',
  ASSET_FROM_FILES: 'asset:from-files',
  ASSET_SAVE_BUFFER: 'asset:save-buffer',
  ASSET_LIST: 'asset:list',
  ASSET_ORPHANS: 'asset:orphans',
  ASSET_REVEAL: 'asset:reveal',
  ASSET_OPEN_EXTERNAL: 'asset:open-external',
  ASSET_READ_DATA_URL: 'asset:read-data-url',

  // ---- export -------------------------------------------------------------
  EXPORT_PREVIEW: 'export:preview',
  EXPORT_RUN: 'export:run',

  // ---- misc ---------------------------------------------------------------
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  SHELL_SHOW_ITEM: 'shell:show-item',
  CLIPBOARD_WRITE_TEXT: 'clipboard:write-text',
  CLIPBOARD_WRITE_IMAGE: 'clipboard:write-image',
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_SAVE_FILE: 'dialog:save-file'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
