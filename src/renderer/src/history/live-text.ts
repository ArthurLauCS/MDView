/**
 * The live document text, for callers that must read or replace it without a
 * React tree of their own.
 *
 * The history panel has two needs the preload surface cannot serve: `立即记录`
 * must snapshot what is *currently* on screen (the editor's buffer is not on
 * disk yet), and restoring has to land in that same buffer rather than write
 * the file behind the editor's back. The editor publishes both sides here on
 * mount — the same seam `state/editor-context` uses for the caret, and for the
 * same reason: history must not reach up into the editor, or the two become
 * mutually dependent.
 */
let read: () => string | null = () => null
let write: (text: string) => void = () => undefined

export function publishLiveText(getter: () => string | null, setter: (text: string) => void): void {
  read = getter
  write = setter
}

export function clearLiveText(): void {
  read = () => null
  write = () => undefined
}

/** Buffer contents, or null when no document is open. */
export function liveText(): string | null {
  return read()
}

/** Replace the buffer. The editor's own autosave persists the change. */
export function restoreText(text: string): void {
  write(text)
}
