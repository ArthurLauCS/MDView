/**
 * Cross-process data contracts.
 * Renderer, preload and main all speak these types — keep them dependency free.
 */

/** How a document's assets are laid out on disk. */
export type DocLayout =
  /** `Notes.md` + `Notes_img/` — flat tree, both siblings. DEFAULT. */
  | 'flat'
  /** `Notes/Notes.md` + `Notes/img/` — md nested inside its own folder. */
  | 'nested'

export type ExportMode =
  /** Portable plain markdown: images and local paths stripped. */
  | 'plain-md'
  /** Zip the whole document folder, paths untouched. */
  | 'zip'
  /** Self-contained single HTML file with base64 assets. */
  | 'html'
  | 'pdf'

/** Which of the three image placeholders to leave behind in `plain-md` export. */
export type PlainMdImagePolicy = 'drop' | 'alt-placeholder' | 'empty-ref'

export interface TreeNode {
  name: string
  /** Absolute path on disk. */
  path: string
  kind: 'dir' | 'file'
  /** Present for files, null for directories. */
  docId: string | null
  /** `_img`-style asset directory, surfaced separately in the sidebar. */
  isAssetDir: boolean
  children: TreeNode[] | null
  mtimeMs: number
  sizeBytes: number
}

export interface WorkspaceInfo {
  rootPath: string
  name: string
  tree: TreeNode
  openedAt: number
}

export interface DocumentMeta {
  /** Stable id: sha1 of the absolute path, lowercased. */
  id: string
  path: string
  /** Directory that holds the document folder. */
  parentDir: string
  /** `Notes` for `Notes.md` — the folder stem and the `_img` prefix. */
  stem: string
  /** Absolute path of where images for this document go. */
  assetDir: string
  layout: DocLayout
}

export interface DocumentContent {
  meta: DocumentMeta
  text: string
  /** Frontmatter parsed off the top, if any. */
  frontmatter: Record<string, unknown> | null
  /** Body with frontmatter removed — what the editor actually edits. */
  body: string
  /** Set when the file changed on disk while we held unsaved edits. */
  conflictWithDisk: boolean
}

export interface AssetRef {
  /** Relative path exactly as written in the markdown, e.g. `./Notes_img/a.png`. */
  relPath: string
  /** Absolute path resolved against the document folder. */
  absPath: string
  exists: boolean
  /** `false` when the link points outside the document folder. */
  insideDocFolder: boolean
}

export interface InsertedAsset {
  relPath: string
  absPath: string
  /** True when an identical file (sha256 match) already existed. */
  reused: boolean
  bytes: number
  width: number | null
  height: number | null
}

export interface ExportPreview {
  mode: ExportMode
  /** Lines removed by the sanitizer, with their original line numbers. */
  removals: { line: number; text: string; reason: string }[]
  /** Final output text — only populated for `plain-md`. */
  output: string
  /** Absolute path the export would be written to. */
  targetPath: string
}

export type ThemeMode = 'dark' | 'light' | 'system'
export type MotionLevel = 'full' | 'reduced' | 'off'

export interface AppSettings {
  theme: ThemeMode
  motion: MotionLevel
  docLayout: DocLayout
  plainMdImagePolicy: PlainMdImagePolicy
  /** Base reading font size in px. */
  fontSize: number
  /** Max measure in `ch` units — readability guard. */
  measure: number
  fontUi: string | null
  fontRead: string | null
  fontCode: string | null
  sidebarVisible: boolean
  outlineVisible: boolean
  typewriterMode: boolean
  highlightCurrentLine: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  motion: 'full',
  docLayout: 'flat',
  plainMdImagePolicy: 'alt-placeholder',
  fontSize: 17,
  measure: 72,
  fontUi: null,
  fontRead: null,
  fontCode: null,
  sidebarVisible: true,
  outlineVisible: true,
  typewriterMode: false,
  highlightCurrentLine: true
}
