import { useState } from 'react'
import { useWorkspace } from '../state/workspace'
import { usePatchSettings } from '../state/settings'
import { openDocument, useDocuments } from '../state/documents'
import type { TreeNode } from '@shared/types'
import './sidebar.css'

function TreeRow({ node, depth }: { node: TreeNode; depth: number }): JSX.Element | null {
  const [open, setOpen] = useState(depth < 1)
  const { active } = useDocuments()

  if (node.isAssetDir) return null

  if (node.kind === 'dir') {
    return (
      <div className="tree__group">
        <button
          className="tree__row tree__row--dir"
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`tree__chevron ${open ? 'is-open' : ''}`} aria-hidden />
          <span className="tree__label">{node.name}</span>
        </button>
        {open && node.children?.map((c) => <TreeRow key={c.path} node={c} depth={depth + 1} />)}
      </div>
    )
  }

  const isActive = active?.meta.path === node.path
  return (
    <button
      className={`tree__row tree__row--file ${isActive ? 'is-active' : ''}`}
      style={{ paddingLeft: `${depth * 12 + 26}px` }}
      onClick={() => void openDocument(node.path)}
      title={node.path}
    >
      <span className="tree__label">{node.name.replace(/\.(md|markdown|mdx)$/i, '')}</span>
    </button>
  )
}

export function Sidebar(): JSX.Element {
  const { info } = useWorkspace()
  const patch = usePatchSettings()
  const close = (): void => patch({ sidebarVisible: false })

  return (
    <>
      {/* Only reachable under the narrow breakpoint; a click anywhere off the
          panel dismisses it, which is what an overlay implies. */}
      <button className="sidebar__scrim" onClick={close} aria-label="关闭侧栏" />
      <aside className="sidebar">
      <div className="sidebar__head">
        <span className="sidebar__title">{info?.name ?? '未打开目录'}</span>
      </div>
      <nav className="sidebar__tree">
        {info ? (
          info.tree.children?.map((c) => <TreeRow key={c.path} node={c} depth={0} />)
        ) : (
          <p className="sidebar__empty">
            还没有打开目录。
            <br />
            用上方「打开目录」选一个装满 markdown 的文件夹。
          </p>
        )}
      </nav>
      </aside>
    </>
  )
}
