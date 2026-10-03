import { useEffect, useState } from 'react'
import { resolveWelcome } from '../state/welcome'
import { BUNDLED_SKILLS, WELCOME_DOC_REL } from '@shared/skills'

interface Props {
  onClose: () => void
}

interface StockState {
  /** Absolute path of the bundled welcome document, once resolved. */
  docPath: string | null
  status: 'loading' | 'ready' | 'missing'
}

/**
 * Unpacks the bundled welcome document on first use.
 *
 * The document ships inside the app because it is the product's own
 * explanation of itself; making the user find it in the install directory
 * would defeat that. It is copied into the user's document folder so its
 * images have somewhere to live and so they can edit or share it.
 */
export function HelpPanel({ onClose }: Props): JSX.Element {
  const [stock, setStock] = useState<StockState>({ docPath: null, status: 'loading' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void window.mdview.app
      .resolveStock(WELCOME_DOC_REL)
      .then((resolved) => {
        if (live) setStock({ docPath: resolved, status: resolved ? 'ready' : 'missing' })
      })
      .catch(() => {
        if (live) setStock({ docPath: null, status: 'missing' })
      })
    return () => {
      live = false
    }
  }, [])

  const openWelcome = async (): Promise<void> => {
    if (!stock.docPath) return
    setBusy(true)
    try {
      await resolveWelcome()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel__scrim" onMouseDown={onClose}>
      <div
        className="panel"
        role="dialog"
        aria-label="帮助"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="panel__head">
          <h2 className="panel__title">帮助</h2>
          <button className="panel__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <div className="panel__body">
          <section className="section">
            <div className="section__head"><h3 className="section__title">从写作到保存</h3></div>
            <ol className="help__steps">
              <li>首次启动即可在空白文档输入。点击「新建文档」或按 Ctrl+N 开始另一篇。</li>
              <li>按 Ctrl+S 选择文件名与位置。取消对话框会保留内容，未命名时不自动保存、不记录快照。</li>
              <li>首次保存成功后，按设置启用自动保存与版本历史；关闭自动保存时用 Ctrl+S 手动保存。</li>
              <li>插图前先保存文档。图片存放在文档旁，分享时携带文档及其图片文件夹。</li>
              <li>新建、打开其他文件或退出时，未保存修改可选择保存、不保存或取消；保存失败会保留当前文档。</li>
              <li>「设置」独立管理外观、文档、编辑器和图片；快捷键在其中按功能分类。F1 可直接进入快捷键页。</li>
              <li>正文和图片随窗口伸缩；拖动正文两侧细线分别调整边距，双击恢复默认。导出快捷键 Ctrl+Shift+E 在其他面板中仍可用。</li>
            </ol>
          </section>
          <section className="section">
            <div className="section__head">
              <h3 className="section__title">入门</h3>
            </div>

            <div className="row row--stack">
              <span className="row__label">
                <span className="row__name">欢迎使用 MDView</span>
                <span className="row__hint">
                  一篇用本应用写成的说明文档，包含图片、表格、代码检测和脚注的实际效果。
                  它同时演示了这个项目最重要的设计：文档和它的图片放在同一个文件夹里，
                  整个文件夹拷给别人就能正常显示。
                </span>
              </span>
              <span className="row__control" style={{ width: '100%' }}>
                <button
                  className="btn btn--primary"
                  disabled={stock.status !== 'ready' || busy}
                  onClick={() => void openWelcome()}
                >
                  打开欢迎文档
                </button>
                <button
                  className="btn"
                  disabled={stock.status !== 'ready'}
                  onClick={() => {
                    if (stock.docPath) void window.mdview.app.revealStock(WELCOME_DOC_REL)
                  }}
                >
                  在文件夹中显示
                </button>
                {stock.status === 'missing' && (
                  <span className="row__hint">这个构建没有包含欢迎文档</span>
                )}
              </span>
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h3 className="section__title">给 AI 的协作规则</h3>
            </div>
            <p className="panel__note" style={{ marginTop: 0 }}>
              下面这些规则可以直接交给你的 AI 助手。它们让 AI 生成的图片存进文档自己的
              图片文件夹，并用相对路径引用 —— 而不是把 base64 塞进 markdown，或者丢一张
              过一段时间就失效的远程链接。
            </p>
            {BUNDLED_SKILLS.map((skill) => (
              <div className="row" key={skill.id}>
                <span className="row__label">
                  <span className="row__name">{skill.title}</span>
                  <span className="row__hint">{skill.summary}</span>
                </span>
                <span className="row__control">
                  <button
                    className="btn"
                    onClick={() => void window.mdview.clipboard.writeText(skill.body)}
                  >
                    复制
                  </button>
                </span>
              </div>
            ))}
            <p className="panel__note">
              复制上面的规则，粘进你 AI 助手的项目规则文件（Claude Code 是
              <code>CLAUDE.md</code> 或 <code>.claude/skills/</code>，其他工具同理），
              它再生成图片时就会直接存进文档的图片文件夹。
            </p>
          </section>

          <section className="section">
            <div className="section__head">
              <h3 className="section__title">数据位置</h3>
            </div>
            <div className="row">
              <span className="row__label">
                <span className="row__name">设置与会话</span>
                <span className="row__hint">%APPDATA%/mdview/</span>
              </span>
            </div>
            <div className="row">
              <span className="row__label">
                <span className="row__name">历史版本</span>
                <span className="row__hint">
                  %APPDATA%/mdview/history/ — 按文档分目录，按内容哈希去重
                </span>
              </span>
            </div>
            <p className="panel__note">
              文件本身永远不会离开你打开的文件夹。历史版本存在应用数据目录下，
              这样你发给别人的文件夹里不会多出一个 .history 目录。
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
