/**
 * Image insertion: clipboard, dialog and drag-drop all converge on `insertInto`.
 *
 * The functions here own the markdown and the caret; the main process owns the
 * bytes and the path. Nothing in this file builds a path, so nothing here can
 * write an absolute one into a document.
 */

import { splice } from './splice'
import type { InsertedAsset } from '@shared/types'

export interface InsertResult {
  markdown: string
  cursor: number
  assets: InsertedAsset[]
}

const FALLBACK_ALT = '图片'

/** Alt text from a source filename — never from the hashed name on disk. */
function altFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? ''
  return base.replace(/\.[^.]*$/, '') || FALLBACK_ALT
}

/**
 * The text one dropped file should be inserted as.
 *
 * When a selection exists it is the alt text and the image takes its place, so
 * a link written around a filename is not silently rewritten.
 */
export function altFor(source: string, selection: string | null): string {
  if (selection) return selection
  return source ? altFromPath(source) : FALLBACK_ALT
}

interface Inserted {
  text: string
  cursor: number
}

/**
 * Put already-written markdown into the source at the caret.
 *
 * One image with nothing selected goes inline: pasting an image mid-sentence is
 * legitimate, so no newline is forced on either side. A run of images, or any
 * insertion that displaces a selection, gets each image on its own line.
 */
function insertInto(
  source: string,
  cursor: number,
  selection: string | null,
  markdown: string[]
): Inserted {
  const multi = markdown.length > 1 || selection !== null
  const body = multi ? markdown.join('\n') : markdown[0]
  const removed = selection?.length ?? 0

  // Both boundary checks read the *intermediate* text — the source with the
  // selection already cut out. `cursor - 1` is unchanged by the cut, but the
  // character after the caret is the one that followed the selection, not the
  // selection's own first character.
  const needsBefore = source[cursor - 1] !== undefined && source[cursor - 1] !== '\n'
  const needsAfter = source[cursor + removed] !== undefined && source[cursor + removed] !== '\n'
  const insert = `${needsBefore ? '\n' : ''}${body}${needsAfter ? '\n' : ''}`
  const placed = splice(source, cursor, removed, insert)
  return { text: placed.text, cursor: cursor + (needsBefore ? 1 : 0) + body.length }
}

/** Markdown for one stored asset, with its alt text already resolved. */
export function imageMarkdown(alt: string, asset: InsertedAsset): string {
  return `![${alt}](${asset.relPath})`
}

export async function insertFromClipboard(
  docPath: string,
  source: string,
  cursor: number,
  selection?: string
): Promise<InsertResult | null> {
  const asset = await window.mdview.asset.fromClipboard(docPath)
  // Null means "no image on the clipboard" and nothing else. The caller falls
  // through to a normal text paste on null, so an empty result would swallow
  // the paste and lose the user's text.
  if (!asset) return null
  const alt = altFor(source, selection ?? null)
  const placed = insertInto(source, cursor, selection ?? null, [imageMarkdown(alt, asset)])
  return { markdown: placed.text, cursor: placed.cursor, assets: [asset] }
}

export async function insertFromPaths(
  docPath: string,
  source: string,
  cursor: number,
  selection: string | null,
  filePaths: string[]
): Promise<InsertResult> {
  const assets = await window.mdview.asset.fromFiles(docPath, filePaths)
  if (assets.length === 0) return { markdown: source, cursor, assets: [] }

  // Alt text comes from the original path, paired by position. `fromFiles`
  // drops markdown files, so the asset list can be shorter than the input —
  // reading alt text off the assets' own hashed names would leak the hash.
  const kept = filePaths.filter((p) => !/\.md$/i.test(p))
  const markdown = assets.map((asset, i) =>
    imageMarkdown(altFor(kept[i] ?? '', selection), asset)
  )
  const placed = insertInto(source, cursor, selection, markdown)
  return { markdown: placed.text, cursor: placed.cursor, assets }
}

export async function insertFromFileDialog(
  docPath: string,
  source: string,
  cursor: number,
  selection: string | null
): Promise<InsertResult | null> {
  const paths = await window.mdview.dialog.openImages()
  // Cancelled and "selected nothing" are the same outcome for the caller.
  if (!paths || paths.length === 0) return null
  return insertFromPaths(docPath, source, cursor, selection, paths)
}
