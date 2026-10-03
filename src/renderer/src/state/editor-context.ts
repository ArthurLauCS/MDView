import { useEffect, useState } from 'react'
import type { ActionContext } from '../actions/types'

/**
 * The editor owns the live source and caret, but the command palette and the
 * context menu are mounted above it so they can also serve the welcome screen.
 * This is the seam: the editor publishes its context, the overlays read it.
 *
 * Read-only from the outside — nothing but the editor should be able to
 * rewrite a user's document through this.
 */
let current: (() => ActionContext) | null = null
let scopes: Set<string> = new Set(['app', 'global'])

/**
 * A context for when no document is open. The palette still needs one so that
 * app-level actions (theme, panels, opening a folder) stay reachable from the
 * welcome screen; anything that would edit text is a no-op because there is
 * nothing to edit.
 */
export const EMPTY_CONTEXT: ActionContext = {
  source: '',
  cursor: 0,
  selection: null,
  docPath: null,
  inCodeBlock: false,
  inTable: false,
  tableColumn: null,
  replace: () => undefined,
  toggleLinePrefix: () => undefined,
  toggleInline: () => undefined,
  insertBlock: () => undefined,
  select: () => undefined,
  focus: () => undefined,
  toast: () => undefined
}

type Listener = () => void
const listeners = new Set<Listener>()

export function publishEditorContext(ctx: (() => ActionContext) | null, available: Set<string>): void {
  current = ctx
  scopes = available
  for (const l of listeners) l()
}

/** Never null — callers that need the live one should check `docPath`. */
export function editorContext(): ActionContext {
  return current?.() ?? EMPTY_CONTEXT
}

export function availableScopes(): Set<string> {
  return scopes
}

export function useEditorContext(): { ctx: ActionContext; scopes: Set<string> } {
  const [, bump] = useState(0)

  useEffect(() => {
    const l: Listener = () => bump((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  return { ctx: editorContext(), scopes }
}
