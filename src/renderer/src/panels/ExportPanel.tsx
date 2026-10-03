import { useCallback, useEffect, useState } from 'react'
import type { ExportMode, ExportPreview } from '@shared/types'
import { useDocuments } from '../state/documents'

interface Props {
  onClose: () => void
}

interface ModeDef {
  value: ExportMode
  name: string
  hint: string
  ready: boolean
}

const MODES: ModeDef[] = [
  {
    value: 'plain-md',
    name: '纯 Markdown',
    hint: '剥离图片与本地路径，得到一份可以直接粘贴的文本',
    ready: true
  },
  {
    value: 'zip',
    name: '打包 ZIP',
    hint: '整个文档文件夹压缩，链接原样不动',
    ready: false
  },
  {
    value: 'html',
    name: '单文件 HTML',
    hint: '图片转 base64 内嵌，可直接发邮件',
    ready: false
  },
  {
    value: 'pdf',
    name: 'PDF',
    hint: '长图与分页输出',
    ready: false
  }
]

export function ExportPanel({ onClose }: Props): JSX.Element {
  const { active } = useDocuments()
  const [mode, setMode] = useState<ExportMode>('plain-md')
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const docPath = active?.meta.path ?? null
  const source = active?.body ?? ''

  const runPreview = useCallback(async (): Promise<void> => {
    if (!docPath) return
    setBusy(true)
    setResult(null)
    try {
      setPreview(await window.mdview.export.preview(mode, docPath, source))
    } finally {
      setBusy(false)
    }
  }, [docPath, mode, source])

  useEffect(() => {
    void runPreview()
  }, [runPreview])

  const confirm = async (): Promise<void> => {
    if (!docPath) return
    setBusy(true)
    try {
      const written = await window.mdview.export.run(mode, docPath, source)
      // null means the save dialog was cancelled — not a failure, and not a
      // success either, so it must not produce a confirmation message.
      if (written) setResult(written)
    } finally {
      setBusy(false)
    }
  }

  if (!active) {
    return (
      <div className="panel__scrim" onMouseDown={onClose}>
        <div className="panel" onMouseDown={(e) => e.stopPropagation()}>
          <header className="panel__head">
            <h2 className="panel__title">导出</h2>
            <button className="panel__close" onClick={onClose}>
              Esc
            </button>
          </header>
          <div className="panel__body">
            <p className="panel__empty">先打开一个文档再导出</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel__scrim" onMouseDown={onClose}>
      <div
        className="panel panel--wide"
        role="dialog"
        aria-label="导出"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="panel__head">
          <h2 className="panel__title">导出</h2>
          <button className="panel__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <div className="panel__body">
          <div className="modes">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={`mode ${m.value === mode ? 'is-active' : ''}`}
                disabled={!m.ready}
                onClick={() => setMode(m.value)}
              >
                <span className="mode__name">{m.name}</span>
                <span className="mode__hint">{m.hint}</span>
                {!m.ready && <span className="mode__tag">尚未实现</span>}
              </button>
            ))}
          </div>

          {mode === 'plain-md' && (
            <>
              <section className="section" style={{ marginTop: 'var(--space-8)' }}>
                <div className="section__head">
                  <h3 className="section__title">将要移除的内容</h3>
                  <span className="row__hint">
                    {busy ? '计算中…' : `${preview?.removals.length ?? 0} 行`}
                  </span>
                </div>

                {preview && preview.removals.length === 0 && (
                  <p className="panel__empty">这份文档不含图片和本地路径，导出后内容完全一致</p>
                )}

                {preview && preview.removals.length > 0 && (
                  <div className="diff">
                    {preview.removals.map((r, i) => (
                      <div className="diff__row" key={`${r.line}-${i}`}>
                        <span className="diff__no">{r.line}</span>
                        <span className="diff__text">
                          {r.text || ' '}
                          <span className="diff__reason">— {r.reason}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <p className="panel__note">
                写出目标：{preview?.targetPath ?? '—'}
              </p>
            </>
          )}
        </div>

        <footer className="panel__foot">
          <span>
            {result ? (
              <>
                已导出到 <code>{result}</code>
              </>
            ) : (
              '写出前会先让你确认'
            )}
          </span>
          <button
            className="btn btn--primary"
            disabled={busy || mode !== 'plain-md' || !docPath}
            onClick={() => void confirm()}
          >
            导出
          </button>
        </footer>
      </div>
    </div>
  )
}
