import { useEffect, useState } from 'react'
import { usePatchSettings, useSettings } from '../state/settings'
import './titlebar.css'

interface Props {
  onOpenFolder: () => void
}

/**
 * Frameless window chrome. The three dots are intentionally not macOS traffic
 * lights — they stay muted until hover so the bar reads as part of the page.
 */
export function TitleBar({ onOpenFolder }: Props): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const settings = useSettings()
  const patch = usePatchSettings()

  useEffect(() => {
    void window.mdview.window.isMaximized().then(setMaximized)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar__dots">
        <button
          className="dot dot--close"
          onClick={() => window.mdview.window.close()}
          aria-label="关闭"
        />
        <button
          className="dot dot--min"
          onClick={() => window.mdview.window.minimize()}
          aria-label="最小化"
        />
        <button
          className="dot dot--max"
          onClick={() => {
            window.mdview.window.toggleMaximize()
            setMaximized((m) => !m)
          }}
          aria-label={maximized ? '还原' : '最大化'}
        />
      </div>

      <div className="titlebar__center">
        <span className="titlebar__name">MDView</span>
      </div>

      <div className="titlebar__actions">
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
      </div>
    </header>
  )
}
