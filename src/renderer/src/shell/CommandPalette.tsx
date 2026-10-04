import { t } from '../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ACTIONS } from '../actions/registry'
import { prettyKey } from '../actions/keymap'
import type { ActionContext, ActionDef } from '../actions/types'
import { useSettings } from '../state/settings'
import './palette.css'

interface Props {
  open: boolean
  onClose: () => void
  ctx: ActionContext
  /** Restrict to actions whose scope is reachable right now. */
  availableScopes: Set<string>
}

interface Scored {
  action: ActionDef
  score: number
  /** Indexes into the title that matched, for highlighting. */
  hits: number[]
}

/**
 * Subsequence fuzzy match. Returns the matched indexes so the title can be
 * highlighted — showing *why* a row matched is what makes fuzzy search
 * trustworthy instead of mysterious.
 */
function fuzzy(query: string, text: string): { score: number; hits: number[] } | null {
  if (!query) return { score: 0, hits: [] }
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const hits: number[] = []
  let qi = 0
  let score = 0
  let streak = 0

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      hits.push(ti)
      streak++
      score += 1 + streak * 2
      // A match at a word boundary is worth much more than one mid-word.
      if (ti === 0 || /[\s\-_/.]/.test(t[ti - 1])) score += 6
      qi++
    } else {
      streak = 0
    }
  }

  return qi === q.length ? { score, hits } : null
}

export function CommandPalette({ open, onClose, ctx, availableScopes }: Props): JSX.Element | null {
  const { language } = useSettings()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo<Scored[]>(() => {
    const pool = ACTIONS.filter(
      (a) => availableScopes.has(a.scope) && (!a.enabled || a.enabled(ctx))
    )
    const scored: Scored[] = []
    for (const action of pool) {
      const titleHit = fuzzy(query, action.title)
      const keywordHit = action.keywords
        ?.map((k) => fuzzy(query, k))
        .reduce<{ score: number; hits: number[] } | null>(
          (best, r) => (r && (!best || r.score > best.score) ? r : best),
          null
        )
      const best = titleHit ?? (keywordHit ? { score: keywordHit.score * 0.6, hits: [] } : null)
      if (best) scored.push({ action, score: best.score, hits: best.hits })
    }
    // A bound action is more likely to be what you meant than an unbound one.
    scored.sort((a, b) => b.score - a.score || (b.action.key ? 1 : 0) - (a.action.key ? 1 : 0))
    return scored.slice(0, 40)
  }, [query, ctx, availableScopes, language])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // The palette should be typeable the instant it appears.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  /**
   * Escape must close the palette wherever focus happens to be. Relying on
   * the input's own handler means a stray focus change leaves a modal the
   * user cannot dismiss from the keyboard.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  useEffect(() => {
    listRef.current
      ?.querySelector('.palette__row.is-active')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const commit = (index: number): void => {
    const hit = results[index]
    if (!hit) return
    onClose()
    void hit.action.run(ctx)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="palette__scrim" onMouseDown={onClose}>
      <div
        className="palette"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('命令面板')}
      >
        <div className="palette__field">
          <input
            ref={inputRef}
            className="palette__input"
            value={query}
            placeholder={t('输入命令，或搜索功能…')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="palette__hint">Esc</kbd>
        </div>

        <div className="palette__list" ref={listRef}>
          {results.length === 0 && <p className="palette__none">{t('没有匹配的命令')}</p>}
          {results.map((r, i) => (
            <button
              key={r.action.id}
              className={`palette__row ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(i)}
            >
              <span className="palette__title">
                {highlight(r.action.title, r.hits)}
              </span>
              {r.action.key && <kbd className="palette__key">{prettyKey(r.action.key)}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Bold the matched characters so the ranking is legible at a glance. */
function highlight(text: string, hits: number[]): JSX.Element {
  if (hits.length === 0) return <>{text}</>
  const set = new Set(hits)
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="palette__hit">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  )
}
