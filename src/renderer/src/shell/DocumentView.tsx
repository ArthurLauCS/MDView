import { useMemo } from 'react'
import { useDocuments } from '../state/documents'
import { renderMarkdown } from '../markdown/render'
import './document.css'

interface Props {
  onOpenFolder: () => void
  error: string | null
}

export function DocumentView({ onOpenFolder, error }: Props): JSX.Element {
  const { active } = useDocuments()
  const html = useMemo(() => (active ? renderMarkdown(active.body) : ''), [active])

  if (error) {
    return (
      <main className="doc doc--center">
        <p className="doc__notice doc__notice--error">{error}</p>
      </main>
    )
  }

  if (!active) {
    return (
      <main className="doc doc--center">
        <div className="doc__welcome">
          <h1 className="doc__welcome-title">MDView</h1>
          <p className="doc__welcome-body">
            每个文档是一个文件夹，图片存在自己旁边 —— 整个文件夹拷给谁，谁就能看到图。
          </p>
          <button className="doc__welcome-btn" onClick={onOpenFolder}>
            打开一个目录
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="doc">
      <article className="md" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  )
}
