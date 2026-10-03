import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [subActive, setSubActive] = useState(-1)
  const [position, setPosition] = useState<React.CSSProperties>({})
  const [subPosition, setSubPosition] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)

  const entries: MenuEntry[] = anchor ? buildContextMenu(anchor.target, ctx) : []
  const order = navigableIndexes(entries)
  const submenu = openSub === null ? null : entries[openSub]
  const subItems = submenu?.kind === 'submenu' ? submenu.items : []
  const subOrder = navigableIndexes(subItems)

  useEffect(() => {
    setActive(order[0] ?? -1)
    setOpenSub(null)
    setSubActive(-1)
  }, [anchor])

  useLayoutEffect(() => {
    if (anchor) setPosition(clampToViewport(anchor, ref.current))
  }, [anchor])

  useLayoutEffect(() => {
    const row = ref.current?.querySelector<HTMLElement>(`[data-submenu-index="${openSub}"]`)
    const panel = subRef.current
    if (!row || !panel) return
    const box = row.getBoundingClientRect()
    const parent = ref.current!.getBoundingClientRect()
    const x = parent.right + panel.offsetWidth <= window.innerWidth - 8 ? parent.right - 1 : parent.left - panel.offsetWidth + 1
    setSubPosition({ left: Math.max(8, x), top: Math.max(8, Math.min(box.top, window.innerHeight - panel.offsetHeight - 8)) })
  }, [openSub, position])

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-menu-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
    subRef.current?.querySelector<HTMLElement>(`[data-menu-index="${subActive}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, subActive])

  useEffect(() => {
    if (!anchor) return
    const dismiss = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node) && !subRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (openSub !== null) setOpenSub(null)
        else onClose()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const indexes = openSub !== null ? subOrder : order
        const at = indexes.indexOf(openSub !== null ? subActive : active)
        const next =
          e.key === 'ArrowDown'
            ? indexes[Math.min(at + 1, indexes.length - 1)]
            : indexes[Math.max(at - 1, 0)]
        if (openSub !== null) setSubActive(next)
        else setActive(next)
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'ArrowLeft') setOpenSub(null)
        else if (entries[active]?.kind === 'submenu') {
          setOpenSub(active)
          setSubActive(0)
        }
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const entry = openSub !== null ? subItems[subActive] : entries[active]
        if (entry?.kind === 'submenu') {
          setOpenSub(active)
          setSubActive(0)
        }
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
  }, [anchor, active, openSub, subActive, entries, order, subItems, subOrder, ctx, onClose])

  if (!anchor) return null

  return (
    <>
    <div className="ctxmenu" ref={ref} style={position} role="menu"
      onScroll={() => setOpenSub(null)}
      onMouseLeave={e => { if (!subRef.current?.contains(e.relatedTarget as Node)) setOpenSub(null) }}>
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
              data-submenu-index={i}
              onMouseEnter={() => { setActive(i); setOpenSub(i); setSubActive(-1) }}
            >
              <button className={`ctxmenu__row ${open || active === i ? 'is-active' : ''}`} role="menuitem"
                data-menu-index={i} aria-haspopup="menu" aria-expanded={open}
                onClick={() => { setOpenSub(open ? null : i); setSubActive(0) }}>
                <span className="ctxmenu__label">{entry.title}</span>
                <span className="ctxmenu__chevron" aria-hidden />
              </button>
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
            data-menu-index={i}
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
    {submenu?.kind === 'submenu' && createPortal(
      <div className="ctxmenu ctxmenu--sub" ref={subRef} style={subPosition} role="menu" aria-label={submenu.title}
        onMouseLeave={e => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpenSub(null) }}>
        {subItems.map((item, i) => (
          <button key={item.id} className={`ctxmenu__row ${subActive === i ? 'is-active' : ''} ${item.disabled ? 'is-disabled' : ''}`}
            role="menuitem" data-menu-index={i} disabled={item.disabled} title={item.reason}
            onMouseEnter={() => setSubActive(i)}
            onClick={() => { onClose(); void findAction(item.id)?.run(ctx) }}>
            <span className="ctxmenu__label">{item.title}</span>
            {item.shortcut && <span className="ctxmenu__key">{item.shortcut}</span>}
          </button>
        ))}
      </div>, document.body
    )}
    </>
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
