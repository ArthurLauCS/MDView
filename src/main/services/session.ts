import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { SessionState } from '@shared/types'

const EMPTY: SessionState = {
  workspaceRoot: null,
  activeDoc: null,
  openDocs: [],
  cursors: {},
  scrolls: {},
  updatedAt: 0
}

/**
 * The window's state between launches.
 *
 * Written debounced and read once at boot. Every path is validated on read:
 * a document that has since been moved or deleted must not resurrect as a
 * broken tab, so a stale entry is dropped rather than surfaced.
 */
export class SessionService {
  private readonly file: string
  private readonly marker: string
  private current: SessionState | null

  constructor(userDataDir: string, restore = true) {
    this.file = join(userDataDir, 'session.json')
    this.marker = join(userDataDir, '.first-run-done')
    this.current = restore ? null : { ...EMPTY }
  }

  /**
   * True until the app has completed one launch.
   *
   * A fresh install should show the welcome document rather than an empty
   * window — the document is the product's own explanation of itself, and
   * nobody reads a README they have to go find.
   */
  isFirstRun(): boolean {
    return !existsSync(this.marker)
  }

  markRun(): Promise<void> {
    return fs.writeFile(this.marker, new Date().toISOString(), 'utf8')
  }

  async load(): Promise<SessionState> {
    if (this.current) return this.current
    let state: SessionState
    try {
      state = { ...EMPTY, ...(JSON.parse(await fs.readFile(this.file, 'utf8')) as SessionState) }
    } catch {
      return this.current = { ...EMPTY }
    }

    // Prune anything that no longer exists before the renderer ever sees it.
    const alive = (p: string | null): p is string => typeof p === 'string' && existsSync(p)
    state.openDocs = (state.openDocs ?? []).filter(alive)
    if (!alive(state.activeDoc)) {
      state.activeDoc = state.openDocs[0] ?? null
    }
    if (state.workspaceRoot && !existsSync(state.workspaceRoot)) {
      state.workspaceRoot = null
      state.activeDoc = null
      state.openDocs = []
    }
    for (const key of Object.keys(state.cursors)) {
      if (!existsSync(key)) {
        delete state.cursors[key]
        delete state.scrolls[key]
      }
    }
    return this.current = state
  }

  async save(state: Partial<SessionState>): Promise<void> {
    const next: SessionState = { ...EMPTY, ...state, updatedAt: Date.now() }
    this.current = next
    writeFileSync(this.file, JSON.stringify(next), 'utf8')
  }

  /** Recently opened workspaces, newest first, existing ones only. */
  recentRoots(limit = 8): string[] {
    try {
      const raw = JSON.parse(readFileSync(join(this.file, '..', 'recent.json'), 'utf8')) as {
        roots: string[]
      }
      return (raw.roots ?? []).filter(existsSync).slice(0, limit)
    } catch {
      return []
    }
  }

  async rememberRoot(root: string): Promise<void> {
    const file = join(this.file, '..', 'recent.json')
    // Keep this small read/modify/write atomic across windows in this process.
    const existing = this.recentRoots(50)
    const next = [root, ...existing.filter((r) => r !== root)].slice(0, 12)
    writeFileSync(file, JSON.stringify({ roots: next }), 'utf8')
  }
}
