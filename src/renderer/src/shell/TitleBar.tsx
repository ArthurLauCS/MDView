import { useEffect, useState } from 'react'
import { usePatchSettings, useSettings } from '../state/settings'
import { useDocuments } from '../state/documents'
import { openPanel } from '../state/ui'
import './titlebar.css'

interface Props {
  onOpenFolder: () => void
}

/**
 * Frameless window chrome laid out the way Windows users expect: the app's
 * own controls on the left, the caption in the middle, and the window
 * buttons hard against the top-right corner.
 *
 * The buttons are Segoe Fluent glyphs rather than macOS traffic lights —
 * a close button that lights up red on hover reads as a foreign window.
 */
export function TitleBar({ onOpenFolder }: Props): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const settings = useSettings()
  const patch = usePatchSettings()
  const { active } = useDocuments()

  useEffect(() => {
    void window.mdview.window.isMaximized().then(setMaximized)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar__lead">
        <button
          className="titlebar__btn titlebar__btn--icon"
          onClick={() => patch({ sidebarVisible: !settings.sidebarVisible })}
          aria-label={settings.sidebarVisible ? '隐藏侧栏' : '显示侧栏'}
          title="显示 / 隐藏侧栏  Ctrl+\"
        >
          <span className="titlebar__rail" aria-hidden />
        </button>
        <button className="titlebar__btn" onClick={onOpenFolder}>
          打开目录
        </button>
        <button
          className="titlebar__btn"
          onClick={() => openPanel('help')}
          title="使用说明与快捷键  F1"
        >
          帮助
        </button>
      </div>

      <div className="titlebar__center">
        {active ? (
          <span className="titlebar__doc">
            <span className="titlebar__doc-name">{active.meta.stem}</span>
            <span className="titlebar__doc-dir">{active.meta.parentDir.replace(/.*[\\/]/, '')}</span>
          </span>
        ) : (
          <span className="titlebar__name">MDView</span>
        )}
      </div>

      {/* Windows caption buttons: 46px wide, flush to the corner, no gaps. */}
      <div className="wbtn-group">
        <button
          className="wbtn"
          onClick={() => window.mdview.window.minimize()}
          aria-label="最小化"
          title="最小化"
        >
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M0 5h10" />
          </svg>
        </button>
        <button
          className="wbtn"
          onClick={() => {
            window.mdview.window.toggleMaximize()
            setMaximized((m) => !m)
          }}
          aria-label={maximized ? '向下还原' : '最大化'}
          title={maximized ? '向下还原' : '最大化'}
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
          aria-label="关闭"
          title="关闭"
        >
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M0 0l10 10M10 0L0 10" />
          </svg>
        </button>
      </div>
    </header>
  )
}
