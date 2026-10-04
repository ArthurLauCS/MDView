import { t } from '../i18n'
import { useEffect, useState } from 'react'
import { useSettings } from '../state/settings'
import { useDocuments } from '../state/documents'
import { findAction } from '../actions/registry'
import { prettyKey } from '../actions/keymap'
import { editorContext } from '../state/editor-context'
import './titlebar.css'

/**
 * Frameless window chrome laid out the way Windows users expect: the app's
 * own controls on the left, the caption in the middle, and the window
 * buttons hard against the top-right corner.
 *
 * The buttons are Segoe Fluent glyphs rather than macOS traffic lights —
 * a close button that lights up red on hover reads as a foreign window.
 */
export function TitleBar(): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const settings = useSettings()
  const { active, dirty } = useDocuments()
  const sidebarAction = findAction('view.toggleSidebar')!

  useEffect(() => {
    const refresh = (): void => { void window.mdview.window.isMaximized().then(setMaximized) }
    refresh()
    window.addEventListener('resize', refresh)
    return () => window.removeEventListener('resize', refresh)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar__lead">
        <button
          className="titlebar__btn titlebar__btn--icon"
          onClick={() => void sidebarAction.run(editorContext())}
          aria-label={settings.sidebarVisible ? t('隐藏侧栏') : t('显示侧栏')}
          title={`${sidebarAction.title}  ${prettyKey(sidebarAction.key!)}`}
        >
          <span className="titlebar__rail" aria-hidden />
        </button>
        {['document.new', 'document.open', 'document.save', 'workspace.open', 'view.settings', 'view.help'].map((id) => {
          const action = findAction(id)!
          return <button key={id} className={`titlebar__btn titlebar__btn--${id.split('.')[1]}`}
            onClick={() => void action.run(editorContext())} aria-label={action.title}
            title={`${action.title}${action.key ? `  ${prettyKey(action.key)}` : ''}`}>
            {action.title}
          </button>
        })}
      </div>

      <div className="titlebar__center">
        {active ? (
          <span className="titlebar__doc">
            <span className="titlebar__doc-name">{dirty ? '● ' : ''}{active.meta.path ? active.meta.stem : t('未命名')}</span>
            <span className="titlebar__doc-dir">{active.meta.parentDir.replace(/.*[\\/]/, '')}</span>
          </span>
        ) : (
          <span className="titlebar__name">MDWisp</span>
        )}
      </div>

      {/* Windows caption buttons: 46px wide, flush to the corner, no gaps. */}
      <div className="wbtn-group">
        <button
          className="wbtn"
          onClick={() => window.mdview.window.minimize()}
          aria-label={t('最小化')}
          title={t('最小化')}
        >
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M0 5h10" />
          </svg>
        </button>
        <button
          className="wbtn"
          onClick={() => {
            window.mdview.window.toggleMaximize()
          }}
          aria-label={maximized ? t('向下还原') : t('最大化')}
          title={maximized ? t('向下还原') : t('最大化')}
        >
          {maximized ? (
            <svg viewBox="0 0 10 10" aria-hidden>
              <path d="M2.5 2.5V0.5h7v7h-2" />
              <rect x="0.5" y="2.5" width="7" height="7" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" aria-hidden>
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          )}
        </button>
        <button
          className="wbtn wbtn--close"
          onClick={() => window.mdview.window.close()}
          aria-label={t('关闭')}
          title={t('关闭')}
        >
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M0 0l10 10M10 0L0 10" />
          </svg>
        </button>
      </div>
    </header>
  )
}
