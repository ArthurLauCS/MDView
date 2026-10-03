import { useEffect, useState } from 'react'
import type { SessionState } from '@shared/types'
import { openWorkspacePath } from './workspace'
import { openDocument } from './documents'

/**
 * Restores the window's previous state on launch and keeps it up to date.
 *
 * The session is written debounced and only ever describes paths that still
 * exist, so a document moved between sessions disappears silently rather
 * than reopening as an error.
 *
 * Every path is also recorded through the same state modules the UI uses,
 * so a restored document behaves exactly like one the user opened by hand.
 */
let current: SessionState | null = null
let timer: number | null = null

export function sessionSnapshot(): SessionState | null {
  return current
}

/** Merge a change and schedule a write. */
export function touchSession(patch: Partial<SessionState>): void {
  current = {
    workspaceRoot: null,
    activeDoc: null,
    openDocs: [],
    cursors: {},
    scrolls: {},
    updatedAt: Date.now(),
    ...current,
    ...patch
  }
  if (timer) window.clearTimeout(timer)
  // Debounced: caret moves fire constantly, and a session file is not worth
  // a disk write per keystroke.
  timer = window.setTimeout(() => {
    if (current) void window.mdview.session.save(current)
  }, 1200)
}

export function rememberCursor(docPath: string, offset: number): void {
  if (!current) return
  touchSession({ cursors: { ...current.cursors, [docPath]: offset } })
}

export function rememberScroll(docPath: string, offset: number): void {
  if (!current) return
  touchSession({ scrolls: { ...current.scrolls, [docPath]: offset } })
}

export function cursorFor(docPath: string): number {
  return current?.cursors[docPath] ?? 0
}

/**
 * Reopen whatever was open last time. Returns true when a document was
 * restored, so the caller can decide whether to show the welcome screen.
 */
export async function restoreSession(): Promise<boolean> {
  const state = await window.mdview.session.load()
  current = state

  // A fresh install opens the welcome document rather than an empty window.
  if (state.firstRun && !state.workspaceRoot) {
    const { resolveWelcome } = await import('./welcome')
    if (await resolveWelcome()) return true
  }

  if (state.workspaceRoot) {
    try {
      await openWorkspacePath(state.workspaceRoot)
    } catch {
      // The folder went away between sessions; start clean rather than
      // leaving the window in a broken half-open state.
      current = null
      return false
    }
  }

  if (state.activeDoc) {
    try {
      await openDocument(state.activeDoc)
      return true
    } catch {
      return false
    }
  }
  return false
}

export function recentWorkspaces(): Promise<string[]> {
  return window.mdview.session.recent()
}

/** Flush any pending write immediately, for window close. */
export function flushSession(): void {
  if (timer) window.clearTimeout(timer)
  if (current) void window.mdview.session.save(current)
}

/**
 * Runs the restore once and reports whether it found anything.
 *
 * `booted` gates the first paint: rendering the welcome screen and then
 * swapping it for a restored document would flash, and reading the session
 * is fast enough that waiting is not noticeable.
 */
export function useSessionBoot(): { booted: boolean; restored: boolean } {
  const [state, setState] = useState<{ booted: boolean; restored: boolean }>({
    booted: false,
    restored: false
  })

  useEffect(() => {
    let live = true
    void restoreSession().then((restored) => {
      if (live) setState({ booted: true, restored })
    })
    const flush = (): void => flushSession()
    window.addEventListener('beforeunload', flush)
    return () => {
      live = false
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  return state
}
