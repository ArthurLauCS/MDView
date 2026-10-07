import { t } from '../i18n'
import { useEffect, useState } from 'react'
import { resolveWelcome } from '../state/welcome'
import { BUNDLED_SKILLS, WELCOME_DOC_REL, WELCOME_DOC_EN_REL } from '@shared/skills'
import { useSettings } from '../state/settings'

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
  const { language } = useSettings()
  const welcomePath = language === 'en' ? WELCOME_DOC_EN_REL : WELCOME_DOC_REL
  const [stock, setStock] = useState<StockState>({ docPath: null, status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installResult, setInstallResult] = useState('')

  useEffect(() => {
    let live = true
    void window.mdview.app
      .resolveStock(welcomePath)
      .then((resolved) => {
        if (live) setStock({ docPath: resolved, status: resolved ? 'ready' : 'missing' })
      })
      .catch(() => {
        if (live) setStock({ docPath: null, status: 'missing' })
      })
    return () => {
      live = false
    }
  }, [welcomePath])

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
        aria-label={t('帮助')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="panel__head">
          <h2 className="panel__title">{t('帮助')}</h2>
          <button className="panel__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <div className="panel__body">
          <section className="section">
            <div className="section__head"><h3 className="section__title">{t('从写作到保存')}</h3></div>
            <ol className="help__steps">
              <li>{t('按住 Ctrl 点击链接，可打开网址、其他 Markdown 文档或文内标题；macOS 使用 Cmd。')}</li>
              <li>{t('首次启动即可在空白文档输入。点击「新建文档」或按 Ctrl+N 开始另一篇。')}</li>
              <li>{t('按 Ctrl+S 选择文件名与位置。取消对话框会保留内容，未命名时不自动保存、不记录快照。')}</li>
              <li>{t('首次保存成功后，按设置启用自动保存与版本历史；关闭自动保存时用 Ctrl+S 手动保存。')}</li>
              <li>{t('插图前先保存文档。图片存放在文档旁，分享时携带文档及其图片文件夹。')}</li>
              <li>{t('新建、打开其他文件或退出时，未保存修改可选择保存、不保存或取消；保存失败会保留当前文档。')}</li>
              <li>{t('「设置」独立管理外观、文档、编辑器和图片；快捷键在其中按功能分类。F1 可直接进入快捷键页。')}</li>
              <li>{t('正文和图片随窗口伸缩；拖动正文两侧细线分别调整边距，双击恢复默认。导出快捷键 Ctrl+Shift+E 在其他面板中仍可用。')}</li>
            </ol>
          </section>
          <section className="section">
            <div className="section__head">
              <h3 className="section__title">{t('入门')}</h3>
            </div>

            <div className="row row--stack">
              <span className="row__label">
                <span className="row__name">{t('欢迎使用 MDWisp')}</span>
                <span className="row__hint">
                  {t('一篇用本应用写成的说明文档，包含图片、表格、代码检测和脚注的实际效果。 它同时演示了这个项目最重要的设计：文档和它的图片放在同一个文件夹里， 整个文件夹拷给别人就能正常显示。')}</span>
              </span>
              <span className="row__control" style={{ width: '100%' }}>
                <button
                  className="btn btn--primary"
                  disabled={stock.status !== 'ready' || busy}
                  onClick={() => void openWelcome()}
                >
                  {t('打开欢迎文档')}</button>
                <button
                  className="btn"
                  disabled={stock.status !== 'ready'}
                  onClick={() => {
                    if (stock.docPath) void window.mdview.app.revealStock(welcomePath)
                  }}
                >
                  {t('在文件夹中显示')}</button>
                {stock.status === 'missing' && (
                  <span className="row__hint">{t('这个构建没有包含欢迎文档')}</span>
                )}
              </span>
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h3 className="section__title">{t('给 AI 的协作规则')}</h3>
            </div>
            <p className="panel__note" style={{ marginTop: 0 }}>
              {t('让 AI 直接按文档文件夹格式产出文档：图片存进文档自己的图片文件夹，用相对路径引用， 可以要求不生成图片或尽量生成图片。')}</p>
            <div className="row">
              <span className="row__label">
                <span className="row__name">{t('Claude Code 插件')}</span>
                <span className="row__hint">
                  {t('复制后粘进 Claude Code 执行，之后用')}<code>/mdwisp:doc</code> {t('写文档，或直接让它写一份文档')}</span>
              </span>
              <span className="row__control">
                <button
                  className="btn"
                  onClick={() =>
                    void window.mdview.app.pluginPath().then((path) =>
                      window.mdview.clipboard.writeText(`/plugin marketplace add "${path}"\n/plugin install mdwisp@mdwisp`)
                    )
                  }
                >
                  {t('复制安装命令')}</button>
              </span>
            </div>
            <div className="row">
              <span className="row__label">
                <span className="row__name">Codex / Cursor</span>
                <span className="row__hint">
                  {t('选择项目文件夹，安装共用技能与校验脚本。Codex 使用')}<code>$mdwisp-doc</code>{t('，Cursor 使用')}<code>/mdwisp-doc</code>。
                </span>
              </span>
              <span className="row__control">
                <button className="btn" disabled={installing} onClick={async () => {
                  setInstalling(true)
                  setInstallResult('')
                  try {
                    const path = await window.mdview.app.installSkills()
                    if (path) setInstallResult(t('已安装到 {0}。在该项目中新建会话；若未出现，请重启 Codex / Cursor。', path))
                  } catch (error) {
                    setInstallResult(t('安装失败：{0}', String(error)))
                  } finally {
                    setInstalling(false)
                  }
                }}>
                  {installing ? t('安装中…') : t('安装到项目')}
                </button>
              </span>
            </div>
            {installResult && <p className="panel__note" role="status">{installResult}</p>}
            {BUNDLED_SKILLS.map((skill) => (
              <div className="row" key={skill.id}>
                <span className="row__label">
                  <span className="row__name">{t(skill.title)}</span>
                  <span className="row__hint">{t(skill.summary)}</span>
                </span>
                <span className="row__control">
                  <button
                    className="btn"
                    onClick={() => void window.mdview.clipboard.writeText(language === 'en' ? skill.bodyEn : skill.body)}
                  >
                    {t('复制')}</button>
                </span>
              </div>
            ))}
            <p className="panel__note">
              {t('Codex 与 Cursor 共用项目下的')}<code>.agents/skills/</code>{t('，规则与 Claude 插件来自同一份源文件。 安装不会修改已有的 AGENTS.md 或 Cursor 规则；也可以复制上面的内容交给其他 AI 助手。')}</p>
          </section>

          <section className="section">
            <div className="section__head">
              <h3 className="section__title">{t('数据位置')}</h3>
            </div>
            <div className="row">
              <span className="row__label">
                <span className="row__name">{t('设置与会话')}</span>
                <span className="row__hint">%APPDATA%/mdview/</span>
              </span>
            </div>
            <div className="row">
              <span className="row__label">
                <span className="row__name">{t('历史版本')}</span>
                <span className="row__hint">
                  {t('%APPDATA%/mdview/history/ — 按文档分目录，按内容哈希去重')}</span>
              </span>
            </div>
            <p className="panel__note">
              {t('文件本身永远不会离开你打开的文件夹。历史版本存在应用数据目录下， 这样你发给别人的文件夹里不会多出一个 .history 目录。')}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
