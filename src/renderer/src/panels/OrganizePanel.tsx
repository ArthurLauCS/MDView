import { t } from '../i18n'
import { useEffect, useState } from 'react'
import type { OrganizePlan } from '@shared/types'
import { useSettings } from '../state/settings'
import { documentBuffer, documentError, hasUnsavedChanges, loadDocument, saveDocument, useDocuments } from '../state/documents'

interface Props {
  onClose: () => void
}

const base = (path: string): string => path.replace(/.*[\\/]/, '')

export function OrganizePanel({ onClose }: Props): JSX.Element {
  const { language } = useSettings()
  const { active } = useDocuments()
  const [plan, setPlan] = useState<OrganizePlan | null>(null)
  const [move, setMove] = useState(false)
  const [download, setDownload] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const docPath = active?.meta.path ?? ''
  const stem = active?.meta.stem ?? ''

  useEffect(() => {
    if (!docPath) return
    window.mdview.doc.organizePlan(docPath, documentBuffer()).then(setPlan, (e) => setError(String(e)))
  }, [docPath, language])

  const confirm = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      // The new copy is written from the buffer; saving first keeps the
      // original identical to it and stops the switch below from asking.
      if (hasUnsavedChanges() && !await saveDocument(false)) return
      const result = await window.mdview.doc.organize(docPath, documentBuffer(), { move, download })
      await loadDocument(result.docPath)
      onClose()
      if (result.failed.length) documentError(t('{0} 张网络图片下载失败，链接保持原样', result.failed.length))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const blocked = !docPath ? t('请先保存文档') : plan?.blocked ?? null
  const imageCount = (plan?.images.length ?? 0) + (download ? plan?.remote.length ?? 0 : 0)

  return (
    <div className="panel__scrim" onMouseDown={onClose}>
      <div className="panel" role="dialog" aria-label={t('整理为文档文件夹')} onMouseDown={(e) => e.stopPropagation()}>
        <header className="panel__head">
          <h2 className="panel__title">{t('整理为文档文件夹')}</h2>
          <button className="panel__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <div className="panel__body">
          {blocked ? (
            <p className="panel__empty">{blocked}</p>
          ) : (
            <>
              <p className="panel__note">
                {t('文档和它的图片放进同一个文件夹，链接改成相对路径。之后把这个文件夹整个发出去，图片不会断。')}</p>
              <pre className="organize__tree">
                {`${stem}/\n├── ${stem}.md\n└── ${stem}_img/${plan ? t('    {0} 张图片', imageCount) : ''}`}
              </pre>
              <p className="panel__note">{t('位置：')}{plan?.targetDir ?? '—'}</p>

              <div className="row">
                <span className="row__label">
                  <span className="row__name">{t('原文件')}</span>
                  <span className="row__hint">
                    {move ? t('原 md 移入回收站；同名 _img 文件夹里的图片全部带走时一并移入') : t('原文件原样保留，新文件夹是一份副本')}
                  </span>
                </span>
                <span className="row__control">
                  <span className="seg">
                    <button className={`seg__item ${move ? '' : 'is-active'}`} onClick={() => setMove(false)}>{t('保留')}</button>
                    <button className={`seg__item ${move ? 'is-active' : ''}`} onClick={() => setMove(true)}>{t('移入回收站')}</button>
                  </span>
                </span>
              </div>

              {!!plan?.remote.length && (
                <div className="row">
                  <span className="row__label">
                    <span className="row__name">{t('下载网络图片')}</span>
                    <span className="row__hint">{plan.remote.length} {t('张图片引用的是网址；下载后离线也能看')}</span>
                  </span>
                  <span className="row__control">
                    <button
                      className={`switch ${download ? 'is-on' : ''}`}
                      role="switch"
                      aria-checked={download}
                      aria-label={t('下载网络图片')}
                      onClick={() => setDownload(!download)}
                    />
                  </span>
                </div>
              )}

              {!!plan?.images.length && (
                <section className="section">
                  <div className="section__head">
                    <h3 className="section__title">{t('将复制的图片')}</h3>
                    <span className="row__hint">{plan.images.length} {t('张')}</span>
                  </div>
                  <div className="diff">
                    {plan.images.map((image, i) => (
                      <div className="diff__row" key={image.from}>
                        <span className="diff__no">{i + 1}</span>
                        <span className="organize__file" title={image.from}>
                          {image.name}
                          {image.name !== base(image.from) && <span className="diff__reason">{t('— 重名，原名')}{base(image.from)}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!!plan?.missing.length && (
                <section className="section">
                  <div className="section__head">
                    <h3 className="section__title">{t('找不到的图片')}</h3>
                    <span className="row__hint">{plan.missing.length} {t('张 · 链接保持原样')}</span>
                  </div>
                  <div className="diff">
                    {plan.missing.map((link, i) => (
                      <div className="diff__row" key={link}>
                        <span className="diff__no">{i + 1}</span>
                        <span className="organize__file">{link}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="panel__foot">
          <span>{error ? t('整理失败：{0}', error) : t('代码块里的示例图片不会被改动')}</span>
          <button className="btn btn--primary" disabled={busy || !plan || !!blocked} onClick={() => void confirm()}>
            {t('整理')}</button>
        </footer>
      </div>
    </div>
  )
}
