import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DiffSummary, Revision } from '@shared/types'
import { useDocuments } from '../state/documents'
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
  /** The revision immediately before this one; null for the oldest. */
  prevId: string | null
  /** Line-count change against the predecessor; null when there is none. */
  delta: number | null
}

export function HistoryPanel({ onClose }: Props): JSX.Element {
  const { active } = useDocuments()
  const docId = active?.meta.id ?? null
  const history = useHistory(docId)
  const { revisions, contentsOf, diffAgainst, snapshot, forget, clear, jumpTo } = history

  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffSummary | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [confirming, setConfirming] = useState<'restore' | 'clear' | null>(null)
  const [forgetting, setForgetting] = useState<string | null>(null)

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
            prevId: prev?.id ?? null,
            // The oldest revision has nothing to be measured against, and a
            // zero delta is not the same claim as "no change".
            delta: prev ? lineDelta(texts[i + 1] ?? '', texts[i]).delta : null
          }
        })
      )
    })()
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
    void diffAgainst(selectedRow.prevId ?? '', selectedRow.rev.id)
      .then((d) => {
        if (live) setDiff(d)
      })
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
    if (text === null) return
    setConfirming(null)
    // The panel never writes the file itself: it hands the text to the editor,
    // which treats a restore like any other edit and autosaves it.
    restoreText(text)
    onClose()
  }, [selected, jumpTo, onClose])

  const recordNow = useCallback(async (): Promise<void> => {
    const text = liveText()
    if (text === null) return
    await snapshot(text, 'manual')
  }, [snapshot])

  return (
    <div className="panel__scrim" onMouseDown={onClose}>
      <div
        className="panel panel--wide"
        role="dialog"
        aria-label="历史版本"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="panel__head">
          <h2 className="panel__title">历史版本</h2>
          <button className="panel__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <div className="panel__body">
          {history.loading && <p className="panel__empty">正在读取历史…</p>}

          {!history.loading && rows.length === 0 && (
            <p className="panel__empty">
              这篇文档还没有还原点。编辑时会自动记录快照，也可以按「立即记录」手动存一个。
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
                            onClick={() => {
                              void forget(row.rev.id)
                              setForgetting(null)
                            }}
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
                        onClick={() => setSelected(row.rev.id)}
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
          <span className="hist__actions">
            {confirming === 'clear' ? (
              <>
                <button className="btn" onClick={() => setConfirming(null)}>
                  取消
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => {
                    void clear()
                    setConfirming(null)
                  }}
                >
                  确认清空
                </button>
              </>
            ) : confirming === 'restore' ? (
              <>
                <button className="btn" onClick={() => setConfirming(null)}>
                  取消
                </button>
                <button className="btn btn--primary" onClick={() => void restore()}>
                  确认恢复
                </button>
              </>
            ) : (
              <>
                <button className="btn" disabled={!active} onClick={() => setConfirming('clear')}>
                  清空历史
                </button>
                <button className="btn" disabled={!active} onClick={() => void recordNow()}>
                  立即记录
                </button>
                <button
                  className="btn btn--primary"
                  disabled={!selected || !active}
                  onClick={() => setConfirming('restore')}
                >
                  恢复到此版本
                </button>
              </>
            )}
          </span>
        </footer>
      </div>
    </div>
  )
}
