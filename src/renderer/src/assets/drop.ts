/**
 * Drag-and-drop of images onto the editor.
 *
 * Two rules drive everything here:
 *
 * 1. Text wins over `Files`, because dragging a link or a text selection out of
 *    a browser carries both, and intercepting it would break ordinary drag-and-
 *    drop of text into the document.
 * 2. A dropped `File` is only usable once the preload turns it into a real
 *    path. A file that will not resolve is handed back to the caller — inventing
 *    a path would put a non-portable absolute path in the document, which is the
 *    exact failure the whole asset layout exists to prevent.
 */

/** Minimal shape of `window.mdview` that this module depends on. */
interface AssetBridge {
  pathForFile: (file: File) => string | null
  fromFiles: (docPath: string, paths: string[]) => Promise<unknown>
}

export type DropKind = 'images' | 'text' | 'none'

export function classifyDrop(dt: DataTransfer): DropKind {
  const types = dt.types
  // Checked first and on purpose: a drag from a browser of a link or a text
  // selection presents `Files` as well, and treating it as an image drop would
  // swallow the text the user actually meant to move.
  if (types.includes('text/markdown') || types.includes('text/plain')) return 'text'
  if (types.includes('Files') && dt.items.length > 0) {
    const images = [...dt.items].filter(
      (i) => i.kind === 'file' && i.type.startsWith('image/')
    )
    if (images.length > 0) return 'images'
    // A file drag that is not an image is not ours to handle; the document has
    // no use for a path to a .zip, and inserting one would be worse than
    // declining. The caller reports it.
    return 'none'
  }
  return 'none'
}

export interface DropTargetOptions {
  /** Called with files the bridge could not resolve to a path. */
  onUnresolved?: (files: File[]) => void
}

export function installDropTarget(
  el: HTMLElement,
  getDocPath: () => string | null,
  onInsert: (files: File[]) => void,
  options: DropTargetOptions = {}
): () => void {
  const bridge = (window.mdview as unknown as { asset: AssetBridge }).asset

  // `dragleave` fires when the pointer crosses onto a child element, which
  // would flicker the highlight off and on across the whole drop. Counting
  // enters against leaves is what makes the state stable.
  let depth = 0
  const setActive = (on: boolean): void => {
    el.classList.toggle('is-drop-active', on)
  }

  const onDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer) return
    if (classifyDrop(e.dataTransfer) !== 'images') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setActive(true)
  }

  const onDragEnter = (e: DragEvent): void => {
    if (!e.dataTransfer) return
    if (classifyDrop(e.dataTransfer) !== 'images') return
    e.preventDefault()
    depth++
    setActive(true)
  }

  const onDragLeave = (e: DragEvent): void => {
    // Moving onto a child is not leaving the drop zone.
    const to = e.relatedTarget as Node | null
    if (to && el.contains(to)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) setActive(false)
  }

  const onDrop = (e: DragEvent): void => {
    if (!e.dataTransfer) return
    const kind = classifyDrop(e.dataTransfer)
    // Only an image drop is claimed; anything else is left to the browser so
    // native text drag-and-drop into the textarea keeps working.
    if (kind !== 'images') return
    e.preventDefault()
    depth = 0
    setActive(false)

    if (!getDocPath()) {
      onInsert([])
      return
    }

    const files = [...e.dataTransfer.files]
    const unresolved: File[] = []
    const resolved: File[] = []
    for (const file of files) {
      const path = bridge.pathForFile(file)
      if (path) resolved.push(file)
      else unresolved.push(file)
    }
    if (unresolved.length > 0) options.onUnresolved?.(unresolved)
    if (resolved.length > 0) onInsert(resolved)
    else onInsert([])
  }

  el.addEventListener('dragover', onDragOver)
  el.addEventListener('dragenter', onDragEnter)
  el.addEventListener('dragleave', onDragLeave)
  el.addEventListener('drop', onDrop)

  return () => {
    el.removeEventListener('dragover', onDragOver)
    el.removeEventListener('dragenter', onDragEnter)
    el.removeEventListener('dragleave', onDragLeave)
    el.removeEventListener('drop', onDrop)
  }
}
