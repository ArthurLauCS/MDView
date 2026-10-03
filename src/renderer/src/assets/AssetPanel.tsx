import { useCallback, useEffect, useState } from 'react'
import { findMissing, findOutsideFolder } from './refs'
import type { AssetRef } from '@shared/types'
import './assets.css'

type Filter = 'all' | 'missing' | 'outside'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'missing', label: '缺失' },
  { id: 'outside', label: '文件夹外' }
]

const EMPTY: Record<Filter, string> = {
  all: '这篇文档还没有图片。把图片拖进编辑器，或按 Ctrl+Shift+I 插入。',
  missing: '没有缺失的图片，所有引用都能找到文件。',
  outside: '没有引用文档文件夹以外的图片。'
}

/** Filename of a relative link, which is what a person actually recognises. */
function fileName(relPath: string): string {
  const decoded = decodeURIComponent(relPath)
  return decoded.split('/').pop() ?? decoded
}

function Thumb({ entry }: { entry: AssetRef }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // A missing file rejects — and one of the filters exists precisely for
    // those, so this is an expected outcome rather than an error to surface.
    window.mdview.asset
      .dataUrl(entry.absPath)
      .then((u) => {
        if (live) setUrl(u)
      })
      .catch(() => {
        if (live) setUrl(null)
      })
    return () => {
      live = false
    }
  }, [entry.absPath])

  // A link the file no longer backs gets a tile of its own rather than an
  // empty slot, so the row still reads as a broken reference.
  if (!url) {
    return (
      <span className="asset__thumb asset__thumb--missing" aria-hidden>
        ⚠
      </span>
    )
  }
  return <img className="asset__thumb" src={url} alt="" />
}

export function AssetPanel({ docPath, source }: { docPath: string; source: string }): JSX.Element {
  const [refs, setRefs] = useState<AssetRef[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let live = true
    setRefs(null)
    void window.mdview.asset.list(docPath, source).then((list) => {
      if (live) setRefs(list)
    })
    return () => {
      live = false
    }
  }, [docPath, source])

  const reveal = useCallback((absPath: string) => {
    // Fire and forget: the OS does the revealing and there is nothing to do
    // with a result, so awaiting it would only delay the click feedback.
    window.mdview.asset.reveal(absPath)
  }, [])

  const shown =
    refs === null ? null : filter === 'missing' ? findMissing(refs) : filter === 'outside' ? findOutsideFolder(refs) : refs

  return (
    <aside className="assets">
      <div className="assets__head">
        <span className="assets__title">图片</span>
        {refs !== null && <span className="assets__count">{refs.length}</span>}
      </div>

      <div className="assets__filters" role="tablist" aria-label="图片筛选">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`assets__filter ${filter === f.id ? 'is-active' : ''}`}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="assets__list">
        {shown === null ? (
          <p className="assets__empty">正在载入…</p>
        ) : shown.length === 0 ? (
          <p className="assets__empty">{EMPTY[filter]}</p>
        ) : (
          shown.map((r) => (
            <button
              key={r.relPath}
              className={`asset ${r.exists ? '' : 'is-missing'}`}
              onClick={() => reveal(r.absPath)}
              title={r.absPath}
            >
              <Thumb entry={r} />
              <span className="asset__body">
                <span className="asset__name">{fileName(r.relPath)}</span>
                <span className="asset__path">{r.relPath}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
