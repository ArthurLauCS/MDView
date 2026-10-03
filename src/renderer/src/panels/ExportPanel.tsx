import { useCallback, useEffect, useState } from 'react'
import type { ExportMode, ExportPreview } from '@shared/types'
import { documentBuffer, useDocuments } from '../state/documents'
import { openPanel } from '../state/ui'

interface Props {
  onClose: () => void
}

interface ModeDef {
  value: ExportMode
  name: string
  hint: string
}

const MODES: ModeDef[] = [
  {
    value: 'plain-md',
    name: '纯 Markdown',
    hint: '剥离图片与本地路径，得到一份可以直接粘贴的文本'
  },
  {
    value: 'zip',
    name: '打包 ZIP',
    hint: '压缩整个文档文件夹里已保存的内容，链接原样不动'
  },
  {
    value: 'html',
    name: '单文件 HTML',
    hint: '图片转 base64 内嵌，可直接发邮件'
  },
  {
    value: 'pdf',
    name: 'PDF',
    hint: 'A4 分页排版，图片内嵌'
  }
]

export function ExportPanel({ onClose }: Props): JSX.Element {
  const { active } = useDocuments()
  const [mode, setMode] = useState<ExportMode>('plain-md')
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const docPath = active?.meta.path ?? null
  const source = documentBuffer()

  // ZIP packs the document's folder. A loose file sits in a folder that is not
  // its own — Downloads, the desktop — and packing that would sweep up everything.
  const needsFolder = mode === 'zip' && !active?.meta.inFolder

  const runPreview = useCallback(async (): Promise<void> => {
    if (!docPath || needsFolder) return
    setBusy(true)
    setResult(null)
    setError(null)
    try {
      setPreview(await window.mdview.export.preview(mode, docPath, source))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }, [docPath, mode, source, needsFolder])

  useEffect(() => {
    void runPreview()
  }, [runPreview])

  const confirm = async (): Promise<void> => {
    if (!docPath) return
    setBusy(true)
    setError(null)
    try {
      const written = await window.mdview.export.run(mode, docPath, source)
      // null means the save dialog was cancelled — not a failure, and not a
      // success either, so it must not produce a confirmation message.
      if (written) setResult(written)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  // A preview for the previously selected mode must not describe this one.
  const shown = preview?.mode === mode ? preview : null
  const plain = mode === 'plain-md'

  if (!docPath) {
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
            <p className="panel__empty">请先保存文档，确定文档及图片的位置后再导出。</p>
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
                onClick={() => setMode(m.value)}
              >
                <span className="mode__name">{m.name}</span>
                <span className="mode__hint">{m.hint}</span>
              </button>
            ))}
          </div>

          {needsFolder && (
            <p className="panel__note">
              这是一份散装文件，所在文件夹里还有别的东西，不能整个打包。
              <button className="panel__link" onClick={() => openPanel('organize')}>先整理为文档文件夹</button>
            </p>
          )}
          {shown && !plain && !needsFolder && <p className="panel__note">{shown.output}</p>}

          {(plain || !!shown?.removals.length) && (
            <section className="section" style={{ marginTop: 'var(--space-8)' }}>
              <div className="section__head">
                <h3 className="section__title">{plain ? '将要移除的内容' : '未包含的内容'}</h3>
                <span className="row__hint">
                  {busy ? '计算中…' : `${shown?.removals.length ?? 0} ${plain ? '行' : '项'}`}
                </span>
              </div>

              {shown && shown.removals.length === 0 && (
                <p className="panel__empty">这份文档不含图片和本地路径，导出后内容完全一致</p>
              )}

              {shown && shown.removals.length > 0 && (
                <div className="diff">
                  {shown.removals.map((r, i) => (
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
          )}

          <p className="panel__note">写出目标：{shown?.targetPath ?? '—'}</p>
        </div>

        <footer className="panel__foot">
          <span>
            {error ? (
              `导出失败：${error}`
            ) : result ? (
              <>
                已导出到 <code>{result}</code>
              </>
            ) : (
              '写出前会先让你确认'
            )}
          </span>
          <button
            className="btn btn--primary"
            disabled={busy || needsFolder}
            onClick={() => void confirm()}
          >
            导出
          </button>
        </footer>
      </div>
    </div>
  )
}
