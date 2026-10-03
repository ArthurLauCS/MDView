import { useEffect, useState } from 'react'
import type { SessionState } from '@shared/types'
import { openWorkspacePath } from './workspace'
import { confirmDocumentChange, currentDocument, documentError, hasUnsavedChanges, newDocument, openDocument } from './documents'

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
  // A double-clicked file is what the user asked for; it outranks last time's.
  const launch = await window.mdview.app.launchDocument()
  const target = launch ?? state.activeDoc

  if (state.workspaceRoot) {
    try {
      await openWorkspacePath(state.workspaceRoot)
    } catch {
      // The folder went away between sessions; start clean rather than
      // leaving the window in a broken half-open state.
      current = null
      if (!launch) return false
    }
  }

  if (target) {
    try {
      await openDocument(target)
      return currentDocument()?.meta.path === target
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
export async function flushSession(): Promise<void> {
  if (timer) window.clearTimeout(timer)
  if (current) await window.mdview.session.save(current)
}

let bootPromise: Promise<boolean> | null = null

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
    bootPromise ??= restoreSession().then(async (restored) => {
      if (!restored) await newDocument()
      return restored
    })
    void bootPromise.then((restored) => {
      if (live) setState({ booted: true, restored })
    })
    const stopOpen = window.mdview.app.onOpenDocument((path) => void openDocument(path))
    let closing = false
    let approved = false
    const stop = window.mdview.window.onCloseRequested(() => {
      if (closing) return
      closing = true
      void (async () => {
        if (!await confirmDocumentChange()) return
        await flushSession()
        approved = true
        window.mdview.window.confirmClose()
      })().catch(documentError).finally(() => { closing = false })
    })
    const beforeReload = (event: BeforeUnloadEvent): void => {
      if (hasUnsavedChanges() && !approved) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeReload)
    return () => {
      live = false
      stop()
      stopOpen()
      window.removeEventListener('beforeunload', beforeReload)
    }
  }, [])

  return state
}
