import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DiffSummary, Revision } from '@shared/types'
import { currentDocument, useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'
import { togglePanel, useHistoryOpen } from '../state/ui'
import { findAction } from '../actions/registry'
import { editorContext } from '../state/editor-context'
import { ResizeHandle } from '../shell/ResizeHandle'
import { useHistory } from './useHistory'
import { relativeTime, absoluteTime } from './relative-time'
import { formatBytes, formatDelta, kindLabel, lineDelta } from './history-format'
import { liveText, restoreText } from './live-text'
import './history.css'

interface Props {
  onClose: () => void
}

/** A revision plus what it changed, so a row is never rendered half-known. */
interface Row {
  rev: Revision
  text: string
  /** The revision immediately before this one; null for the oldest. */
  prevId: string | null
  /** Line-count change against the predecessor; null when there is none. */
  delta: number | null
}

export function HistoryPanel({ onClose }: Props): JSX.Element {
  const { active } = useDocuments()
  const settings = useSettings()
  const docId = active?.meta.path ? active.meta.id : null
  const history = useHistory(docId)
  const { revisions, contentsOf, diffAgainst, snapshot, forget, clear, jumpTo } = history

  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffSummary | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [confirming, setConfirming] = useState<'restore' | 'clear' | null>(null)
  const [forgetting, setForgetting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'diff' | 'text'>('diff')

  const perform = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try { await action() }
    catch (error) { setError(String(error)) }
    finally { setBusy(false) }
  }

  // Line deltas need the blob before each revision, which the index does not
  // carry. One pass over the list, newest first, keeps this to a single read
  // per revision instead of a diff per row.
  useEffect(() => {
    if (!docId || revisions.length === 0) {
      setRows([])
      return
    }
    let live = true
    void (async () => {
      const texts = await Promise.all(
        revisions.map((r) => contentsOf(r.id).then((t) => t ?? ''))
      )
      if (!live) return
      setRows(
        revisions.map((rev, i) => {
          const prev = revisions[i + 1] ?? null
          return {
            rev,
            text: texts[i],
            prevId: prev?.id ?? null,
            // The oldest revision has nothing to be measured against, and a
            // zero delta is not the same claim as "no change".
            delta: prev ? lineDelta(texts[i + 1] ?? '', texts[i]).delta : null
          }
        })
      )
    })().catch((error) => { if (live) setError(String(error)) })
    return () => {
      live = false
    }
  }, [docId, revisions, contentsOf])

  // The newest revision is what the panel is opened for, and a forgotten
  // revision must not leave the selection pointing at nothing.
  useEffect(() => {
    if (rows.length === 0) {
      setSelected(null)
      return
    }
    setSelected((id) => (id && rows.some((r) => r.rev.id === id) ? id : rows[0].rev.id))
  }, [rows])

  const selectedRow = useMemo(
    () => rows.find((r) => r.rev.id === selected) ?? null,
    [rows, selected]
  )

  // Diffed against the revision immediately before it, so the panel always
  // answers one question: what did this snapshot change?
  useEffect(() => {
    if (!selectedRow || !docId) {
      setDiff(null)
      return
    }
    let live = true
    setDiffLoading(true)
    setDiff(null)
    void diffAgainst(selectedRow.prevId ?? '', selectedRow.rev.id)
      .then((d) => {
        if (live) setDiff(d)
      })
      .catch((error) => { if (live) setError(String(error)) })
      .finally(() => {
        if (live) setDiffLoading(false)
      })
    return () => {
      live = false
    }
  }, [docId, selectedRow, diffAgainst])

  const restore = useCallback(async (): Promise<void> => {
    if (!selected) return
    const text = await jumpTo(selected)
    if (text === null || currentDocument()?.meta.id !== docId) return
    setConfirming(null)
    // The panel never writes the file itself: it hands the text to the editor,
    // which treats a restore like any other edit and autosaves it.
    restoreText(text)
  }, [selected, jumpTo, docId])

  const recordNow = useCallback(async (): Promise<void> => {
    const text = liveText()
    if (text === null) return
    await snapshot(text, 'manual')
  }, [snapshot])

  return (
      <section
        className="history-panel"
        id="history-panel"
        aria-label="历史版本"
      >
        <ResizeHandle side="right" />
        <header className="side-panel__head">
          <div>
            <h2 className="side-panel__title">历史版本</h2>
            <div className="side-panel__subtitle" title={active?.meta.path}>{active?.meta.stem ?? '未打开文档'}</div>
          </div>
          <button className="panel__close" onClick={onClose} aria-label="收起历史版本">
            ›
          </button>
        </header>

        <div className="panel__body">
          {(error || history.error) && <p className="hist__error" role="alert">{error || history.error}</p>}
          {history.loading && <p className="panel__empty">正在读取历史…</p>}

          {!history.loading && rows.length === 0 && (
            <p className="panel__empty">
              {!docId ? '首次保存文档后开始记录历史；未命名草稿不会定时保存。' : '这篇文档还没有还原点。点击「立即记录」保存当前内容。'}
            </p>
          )}

          {!history.loading && rows.length > 0 && (
            <div className="hist">
              <ol className="hist__list">
                {rows.map((row) => (
                  <li key={row.rev.id} className="hist__item">
                    {forgetting === row.rev.id ? (
                      <div className="hist__row hist__row--confirm">
                        <span className="hist__confirm-text">删除这个还原点？</span>
                        <span className="hist__confirm-actions">
                          <button
                            className="btn btn--danger"
                            disabled={busy}
                            onClick={() => void perform(async () => {
                              await forget(row.rev.id)
                              setForgetting(null)
                            })}
                          >
                            删除
                          </button>
                          <button className="btn" onClick={() => setForgetting(null)}>
                            取消
                          </button>
                        </span>
                      </div>
                    ) : (
                      <button
                        className={`hist__row ${row.rev.id === selected ? 'is-active' : ''}`}
                        disabled={busy}
                        aria-pressed={row.rev.id === selected}
                        onClick={() => { setSelected(row.rev.id); setConfirming(null) }}
                      >
                        <span className="hist__time" title={absoluteTime(row.rev.at)}>
                          {relativeTime(row.rev.at)}
                        </span>
                        <span className="hist__meta">
                          <span className={`hist__tag hist__tag--${row.rev.kind}`}>
                            {kindLabel(row.rev.kind)}
                          </span>
                          <span className="hist__bytes">{formatBytes(row.rev.bytes)}</span>
                          <span
                            className={`hist__delta ${row.delta === null ? '' : row.delta > 0 ? 'is-add' : row.delta < 0 ? 'is-del' : ''}`}
                          >
                            {row.delta === null ? '起始版本' : formatDelta(row.delta)}
                          </span>
                        </span>
                        <span
                          className="hist__del"
                          role="button"
                          tabIndex={-1}
                          title="删除这个还原点"
                          onClick={(e) => {
                            e.stopPropagation()
                            setForgetting(row.rev.id)
                          }}
                        >
                          ×
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ol>

              <div className="hist__detail">
                <div className="hist__detail-head">
                  <button className="btn" aria-pressed={view === 'diff'} onClick={() => setView('diff')}>变更</button>
                  <button className="btn" aria-pressed={view === 'text'} onClick={() => setView('text')}>全文</button>
                  <button className="btn" disabled={!selected || busy} onClick={() => selected && setForgetting(selected)}>删除此版本</button>
                </div>
                <p className="hist__caption">{selectedRow && absoluteTime(selectedRow.rev.at)}</p>
                {view === 'text' ? <pre className="hist__source">{selectedRow?.text}</pre> : <>
                <p className="hist__caption">{selectedRow?.prevId ? '与上一还原点比较' : '起始版本'}</p>
                <div className="summary">
                  <span className="summary__n">+{diff?.added ?? 0}</span>
                  <span>新增</span>
                  <span className="summary__n">−{diff?.removed ?? 0}</span>
                  <span>删除</span>
                </div>

                {diffLoading && <p className="panel__empty">正在比较…</p>}

                {!diffLoading && diff && diff.hunks.length === 0 && (
                  <p className="panel__empty">这一版与上一版内容相同</p>
                )}

                {!diffLoading &&
                  diff?.hunks.map((hunk, h) => (
                    <div className="diff" key={h}>
                      {hunk.map((line, i) => (
                        <div className={`diff__row diff__row--${line.kind}`} key={`${h}-${i}`}>
                          <span className="diff__no">{line.oldLine ?? ''}</span>
                          <span className="diff__no">{line.newLine ?? ''}</span>
                          <span className={`diff__text diff__text--${line.kind}`}>
                            {line.text || ' '}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>}
              </div>
            </div>
          )}
        </div>

        <footer className="panel__foot">
          <span>
            {confirming === 'clear'
              ? '将删除这篇文档的全部还原点，无法撤销。'
              : confirming === 'restore'
                ? '恢复会覆盖当前内容，原内容会先存为一个还原点。'
                : `${rows.length} 个还原点`}
          </span>
          <fieldset className="hist__actions" disabled={busy}>
            {confirming === 'clear' ? (
              <>
                <button className="btn" onClick={() => setConfirming(null)}>
                  取消
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => void perform(async () => {
                    await clear()
                    setConfirming(null)
                  })}
                >
                  确认清空
                </button>
              </>
            ) : confirming === 'restore' ? (
              <>
                <button className="btn" onClick={() => setConfirming(null)}>
                  取消
                </button>
                <button className="btn btn--primary" disabled={settings.readOnly} onClick={() => void perform(restore)}>
                  确认恢复
                </button>
              </>
            ) : (
              <>
                <button className="btn" disabled={!active || !rows.length} onClick={() => setConfirming('clear')}>
                  清空历史
                </button>
                <button className="btn" disabled={!docId} onClick={() => void perform(recordNow)}>
                  立即记录
                </button>
                <button
                  className="btn btn--primary"
                  disabled={!selected || !active || settings.readOnly}
                  onClick={() => setConfirming('restore')}
                >
                  恢复到此版本
                </button>
              </>
            )}
          </fieldset>
        </footer>
      </section>
  )
}

export function HistoryDock(): JSX.Element {
  const open = useHistoryOpen()
  const { active } = useDocuments()
  const action = findAction('view.history')!
  return <aside className="history-dock" aria-label="文档工具栏">
    {open && <HistoryPanel key={active?.meta.id ?? 'empty'} onClose={() => togglePanel('history')} />}
    <div className="history-dock__rail">
      <button className="history-dock__toggle" title={`${action.title}  ${action.key}`}
        aria-label={action.title} aria-expanded={open} aria-controls="history-panel"
        onClick={() => void action.run(editorContext())}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2" /></svg>
        <span>历史</span>
      </button>
    </div>
  </aside>
}
