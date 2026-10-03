import { useEffect, useRef, useState } from 'react'
import { buildContextMenu, navigableIndexes, type MenuEntry, type MenuTarget } from '../actions/context-menu'
import { findAction } from '../actions/registry'
import type { ActionContext } from '../actions/types'
import './contextmenu.css'

export interface MenuAnchor {
  x: number
  y: number
  target: MenuTarget
}

interface Props {
  anchor: MenuAnchor | null
  ctx: ActionContext
  onClose: () => void
}

export function ContextMenu({ anchor, ctx, onClose }: Props): JSX.Element | null {
  const [active, setActive] = useState(-1)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const entries: MenuEntry[] = anchor ? buildContextMenu(anchor.target, ctx) : []
  const order = navigableIndexes(entries)

  useEffect(() => {
    setActive(order[0] ?? -1)
    setOpenSub(null)
  }, [anchor])

  // Clamp the panel inside the window, flipping up when it would overflow.
  const style = anchor ? clampToViewport(anchor, ref.current) : undefined

  useEffect(() => {
    if (!anchor) return
    const dismiss = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const at = order.indexOf(active)
        const next =
          e.key === 'ArrowDown'
            ? order[Math.min(at + 1, order.length - 1)]
            : order[Math.max(at - 1, 0)]
        setActive(next)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const entry = entries[active]
        if (entry?.kind === 'action' && !entry.disabled) {
          onClose()
          void findAction(entry.id)?.run(ctx)
        }
      }
    }
    window.addEventListener('mousedown', dismiss, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', dismiss, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, active, entries, order, ctx, onClose])

  if (!anchor) return null

  return (
    <div className="ctxmenu" ref={ref} style={style} role="menu">
      {entries.map((entry, i) => {
        if (entry.kind === 'separator') {
          return <div key={`sep-${i}`} className="ctxmenu__sep" role="separator" />
        }
        if (entry.kind === 'submenu') {
          const open = openSub === i
          return (
            <div
              key={`sub-${i}`}
              className="ctxmenu__sub-wrap"
              onMouseEnter={() => setOpenSub(i)}
              onMouseLeave={() => setOpenSub(null)}
            >
              <button className={`ctxmenu__row ${open ? 'is-active' : ''}`} role="menuitem">
                <span className="ctxmenu__label">{entry.title}</span>
                <span className="ctxmenu__chevron" aria-hidden />
              </button>
              {open && (
                <div className="ctxmenu ctxmenu--sub" role="menu">
                  {entry.items.map((item) => (
                    <button
                      key={item.id}
                      className={`ctxmenu__row ${item.disabled ? 'is-disabled' : ''}`}
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        onClose()
                        void findAction(item.id)?.run(ctx)
                      }}
                    >
                      <span className="ctxmenu__label">{item.title}</span>
                      {item.shortcut && <span className="ctxmenu__key">{item.shortcut}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <button
            key={entry.id}
            className={`ctxmenu__row ${i === active ? 'is-active' : ''} ${
              entry.disabled ? 'is-disabled' : ''
            }`}
            role="menuitem"
            disabled={entry.disabled}
            title={entry.reason}
            onMouseEnter={() => {
              setActive(i)
              setOpenSub(null)
            }}
            onClick={() => {
              onClose()
              void findAction(entry.id)?.run(ctx)
            }}
          >
            <span className="ctxmenu__label">{entry.title}</span>
            {entry.shortcut && <span className="ctxmenu__key">{entry.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}

const MENU_W = 260
const MENU_H_EST = 420

function clampToViewport(
  anchor: MenuAnchor,
  el: HTMLElement | null
): React.CSSProperties {
  const h = el?.offsetHeight ?? MENU_H_EST
  const maxX = window.innerWidth - MENU_W - 8
  const flipUp = anchor.y + h > window.innerHeight - 8
  return {
    left: Math.max(8, Math.min(anchor.x, maxX)),
    top: flipUp ? Math.max(8, anchor.y - h) : anchor.y
  }
}
