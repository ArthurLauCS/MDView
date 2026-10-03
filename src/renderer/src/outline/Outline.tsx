import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { extractHeadings, headingAt, type Heading } from './headings'
import './outline.css'

interface Props {
  source: string
  cursor: number
  onJump: (offset: number) => void
}

interface Branch { heading: Heading; children: Branch[] }

export function Outline({ source, cursor, onJump }: Props): JSX.Element {
  const headings = useMemo(() => extractHeadings(source), [source])
  const active = headingAt(headings, cursor)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLUListElement>(null)
  const branches = useMemo(() => {
    const root: Branch[] = []
    const levels = [root]
    for (const heading of headings) {
      const branch = { heading, children: [] }
      levels[heading.depth].push(branch)
      levels[heading.depth + 1] = branch.children
    }
    return root
  }, [headings])

  useEffect(() => {
    if (!active) return
    const parents: string[] = []
    let depth = active.depth
    for (let i = headings.indexOf(active) - 1; i >= 0 && depth > 0; i--) {
      if (headings[i].depth < depth) { parents.push(headings[i].id); depth = headings[i].depth }
    }
    setCollapsed((previous) => {
      if (!parents.some((id) => previous.has(id))) return previous
      const next = new Set(previous)
      parents.forEach((id) => next.delete(id))
      return next
    })
    const frame = requestAnimationFrame(() => listRef.current?.querySelector('[aria-current="location"]')?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [active?.id])

  const render = ({ heading: h, children }: Branch): JSX.Element => {
    const open = !collapsed.has(h.id)
    return <li key={h.id}>
      <div className={`nav-row outline__row ${active?.id === h.id ? 'is-active' : ''}`}
        style={{ '--depth': h.depth } as CSSProperties}>
        {children.length ? <button className="outline__toggle" aria-label={`${open ? '折叠' : '展开'} ${h.text}`}
          aria-expanded={open} onClick={() => setCollapsed((previous) => {
            const next = new Set(previous)
            if (open) next.add(h.id)
            else next.delete(h.id)
            return next
          })}><span className={`tree__chevron ${open ? 'is-open' : ''}`} aria-hidden /></button>
          : <span className="outline__spacer" />}
        <button className="outline__jump" title={h.text} aria-current={active?.id === h.id ? 'location' : undefined}
          onClick={() => {
            const prefix = /^#{1,6}[ \t]*/.exec(source.slice(h.offset))?.[0].length ?? 0
            onJump(h.offset + prefix)
          }}>
          <span className="outline__label">{h.text}</span>
          <span className="outline__level">H{h.level}</span>
        </button>
      </div>
      {children.length > 0 && open && <ul>{children.map(render)}</ul>}
    </li>
  }

  return <nav className="outline" aria-label="文档大纲">
    {headings.length === 0 ? <p className="sidebar__empty">这份文档还没有标题。添加标题后会在这里按层级显示。</p>
      : <ul className="outline__list" ref={listRef}>{branches.map(render)}</ul>}
  </nav>
}
