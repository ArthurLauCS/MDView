import { useState } from 'react'
import { DEFAULT_SETTINGS, type AppSettings, type CursorStyle, type ImageNaming, type MotionLevel, type PlainMdImagePolicy, type ThemeMode } from '@shared/types'
import { usePatchSettings, useSettings } from '../state/settings'
import { ShortcutsSettings } from './ShortcutsPanel'
import './settings.css'

interface Props {
  onClose: () => void
  initialSection?: string
}

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'system', label: '跟随系统' }
]

const MOTIONS: { value: MotionLevel; label: string; hint: string }[] = [
  { value: 'full', label: '完整', hint: '入场、视差与反馈动效全部保留' },
  { value: 'reduced', label: '精简', hint: '只保留表达状态变化的反馈动效' },
  { value: 'off', label: '关闭', hint: '不做过渡，但状态切换仍然可见' }
]

const IMAGE_POLICIES: { value: PlainMdImagePolicy; label: string; hint: string }[] = [
  { value: 'alt-placeholder', label: '保留占位', hint: '图片变成 *[图：alt]* 形式的斜体说明' },
  { value: 'drop', label: '整行删除', hint: '图片所在的行直接去掉' },
  { value: 'empty-ref', label: '保留空引用', hint: '留下 ![]()，之后可重新插图' }
]

const CURSORS: { value: CursorStyle; label: string }[] = [
  { value: 'bar', label: '竖线' },
  { value: 'block', label: '方块' },
  { value: 'underline', label: '下划线' }
]

const IMAGE_NAMINGS: { value: ImageNaming; label: string; hint: string }[] = [
  { value: 'date-hash-name', label: '日期-哈希-原名', hint: '默认。同日多图不会互相覆盖，原名仍可读' },
  { value: 'original', label: '保留原名', hint: '同名文件加序号，方便对照原图' },
  { value: 'hash', label: '仅哈希', hint: '名字最短，但看不出图片是什么' }
]


const SECTIONS = [
  ['appearance', '外观与字体'], ['document', '文档与保存'], ['editor', '编辑器'],
  ['images', '图片'], ['shortcuts', '快捷键']
]

export function SettingsPanel({ onClose, initialSection = 'appearance' }: Props): JSX.Element {
  const [section, setSection] = useState(initialSection)
  const settings = useSettings()
  const patch = usePatchSettings()

  const reset = (keys: (keyof AppSettings)[]): void => {
    const next: Partial<AppSettings> = {}
    for (const k of keys) {
      // A blanket Object.assign would widen the types away from the shape.
      Object.assign(next, { [k]: DEFAULT_SETTINGS[k] })
    }
    patch(next)
  }

  return (
    <div className="panel__scrim" onMouseDown={onClose}>
      <div
        className="panel settings"
        role="dialog"
        aria-label="设置"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="panel__head">
          <h2 className="panel__title">设置</h2>
          <button className="panel__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <div className="settings__layout">
          <nav className="settings__nav" aria-label="设置分类">
            {SECTIONS.map(([id, label]) => <button key={id} className={`settings__tab ${section === id ? 'is-active' : ''}`}
              aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}
          </nav>
        <div className="panel__body settings__content" key={section}>
          {section === 'appearance' && <section className="section">
            <div className="section__head">
              <h3 className="section__title">外观</h3>
              <button
                className="section__reset"
                onClick={() =>
                  reset([
                    'theme',
                    'motion',
                    'fontSize',
                    'fontUi',
                    'fontRead',
                    'fontCode',
                    'fontDisplay',
                    'codeFontSize',
                    'lineHeight',
                    'cursorStyle',
                    'accentOverride'
                  ])
                }
              >
                恢复默认
              </button>
            </div>

            <Row name="主题" hint="深色为基础主题，浅色由同一色相提亮推导">
              <Segmented
                items={THEMES}
                value={settings.theme}
                onChange={(theme) => patch({ theme })}
              />
            </Row>

            <Row
              name="动效强度"
              hint={MOTIONS.find((m) => m.value === settings.motion)?.hint}
            >
              <Segmented
                items={MOTIONS}
                value={settings.motion}
                onChange={(motion) => patch({ motion })}
              />
            </Row>

            <Row name="正文字号" hint="阅读与编辑共用的基础字号">
              <input
                className="field field--num"
                type="number"
                min={12}
                max={26}
                value={settings.fontSize}
                onChange={(e) => patch({ fontSize: clamp(Number(e.target.value), 12, 26) })}
              />
              <span className="row__hint">px</span>
            </Row>

            <FontRow
              name="界面字体"
              value={settings.fontUi}
              cssVar="--font-ui"
              sample="菜单 · 面板 · 按钮 Aa 汉字"
              onChange={(fontUi) => patch({ fontUi })}
            />
            <FontRow
              name="正文字体"
              value={settings.fontRead}
              cssVar="--font-read"
              sample="正文阅读效果 Aa 汉字排版"
              onChange={(fontRead) => patch({ fontRead })}
            />
            <FontRow name="装饰标题字体" value={settings.fontDisplay} cssVar="--font-display"
              sample="章节标题 · 写作与阅读" onChange={(fontDisplay) => patch({ fontDisplay })} />
            <FontRow
              name="代码字体"
              value={settings.fontCode}
              cssVar="--font-code"
              sample="const value = 42 // 等宽 Aa"
              onChange={(fontCode) => patch({ fontCode })}
            />

            <Row name="代码字号" hint="只影响代码块，正文保持自己的字号">
              <input
                className="field field--num"
                type="number"
                min={11}
                max={20}
                step={0.5}
                value={settings.codeFontSize}
                onChange={(e) =>
                  patch({ codeFontSize: clamp(Number(e.target.value), 11, 20) })
                }
              />
              <span className="row__hint">px</span>
            </Row>

            <Row name="行高" hint="正文的行间距倍数，编辑与阅读同步">
              <input
                className="field field--num"
                type="number"
                min={1.3}
                max={2.2}
                step={0.05}
                value={settings.lineHeight}
                onChange={(e) =>
                  patch({ lineHeight: clamp(Number(e.target.value), 1.3, 2.2) })
                }
              />
              <span className="row__hint">倍</span>
            </Row>

            <Row name="光标样式" hint="编辑时插入符的形状">
              <Segmented
                items={CURSORS}
                value={settings.cursorStyle}
                onChange={(cursorStyle) => patch({ cursorStyle })}
              />
            </Row>

            <Row name="强调色" hint="留空使用内置陶土橙">
              <input
                className="field field--color"
                value={settings.accentOverride ?? ''}
                placeholder="#d97757"
                spellCheck={false}
                onChange={(e) => setAccent(e.target.value, patch)}
              />
            </Row>
          </section>}

          {section === 'document' && <section className="section">
            <div className="section__head">
              <h3 className="section__title">文档</h3>
              <button
                className="section__reset"
                onClick={() => reset(['plainMdImagePolicy', 'autoSave', 'autoSaveDelayMs', 'historyEnabled', 'historyIntervalMs'])}
              >
                恢复默认
              </button>
            </div>

            <p className="panel__note">新文档先在内存中编辑；首次保存才选择位置。取消保存会保留草稿。</p>
            <Toggle
              name="自动保存"
              hint={`首次保存并选择位置后，停止输入时自动写盘`}
              value={settings.autoSave}
              onChange={(autoSave) => patch({ autoSave })}
            />
            <Row name="自动保存延迟" hint="最后一次输入到写盘的等待时间">
              <input
                className="field field--num"
                type="number"
                min={200}
                max={5000}
                step={100}
                disabled={!settings.autoSave}
                value={settings.autoSaveDelayMs}
                onChange={(e) =>
                  patch({ autoSaveDelayMs: clamp(Number(e.target.value), 200, 5000) })
                }
              />
              <span className="row__hint">ms</span>
            </Row>
            <Toggle
              name="版本历史"
              hint="首次保存后按间隔留下快照，未命名草稿不记录"
              value={settings.historyEnabled}
              onChange={(historyEnabled) => patch({ historyEnabled })}
            />
            <Row name="快照间隔" hint={`两次自动快照之间的最短间隔`}>
              <input
                className="field field--num"
                type="number"
                min={5}
                max={300}
                step={5}
                disabled={!settings.historyEnabled}
                value={Math.round(settings.historyIntervalMs / 1000)}
                onChange={(e) =>
                  patch({ historyIntervalMs: clamp(Number(e.target.value), 5, 300) * 1000 })
                }
              />
              <span className="row__hint">秒</span>
            </Row>
            <Row name="默认打开方式" hint="Windows 不允许应用自行接管文件类型：在系统设置里搜索 .md，选择 MDView">
              <button className="btn" onClick={() => void window.mdview.shell.openExternal('ms-settings:defaultapps')}>
                打开系统设置
              </button>
            </Row>
            <Row
              name="导出纯 MD 时的图片"
              hint={IMAGE_POLICIES.find((p) => p.value === settings.plainMdImagePolicy)?.hint}
            >
              <Segmented
                items={IMAGE_POLICIES}
                value={settings.plainMdImagePolicy}
                onChange={(plainMdImagePolicy) => patch({ plainMdImagePolicy })}
              />
            </Row>
          </section>}

          {section === 'editor' && <section className="section">
            <div className="section__head">
              <h3 className="section__title">编辑器</h3>
              <button
                className="section__reset"
                onClick={() =>
                  reset([
                    'typewriterMode',
                    'highlightCurrentLine',
                    'readOnly',
                    'sidebarVisible',
                    'outlineVisible',
                    'spellCheck',
                    'autoPair',
                    'smartLists',
                    'tabSize'
                  ])
                }
              >
                恢复默认
              </button>
            </div>

            <Toggle
              name="打字机模式"
              hint="光标恒定居中，视线不用跟着走"
              value={settings.typewriterMode}
              onChange={(typewriterMode) => patch({ typewriterMode })}
            />
            <Toggle
              name="高亮当前行"
              hint="在当前行背后画一条极浅的色带"
              value={settings.highlightCurrentLine}
              onChange={(highlightCurrentLine) => patch({ highlightCurrentLine })}
            />
            <Toggle
              name="只读模式"
              hint="禁止修改文档内容，仅用于阅读"
              value={settings.readOnly}
              onChange={(readOnly) => patch({ readOnly })}
            />
            <Toggle
              name="显示侧栏"
              hint="窄窗口下会自动收起，避免挤占正文"
              value={settings.sidebarVisible}
              onChange={(sidebarVisible) => patch({ sidebarVisible })}
            />
            <Toggle
              name="显示大纲"
              hint="左侧按 H1–H6 组织标题，支持折叠与跳转"
              value={settings.outlineVisible}
              onChange={(outlineVisible) => patch({ outlineVisible })}
            />
            <Toggle
              name="拼写检查"
              hint={`浏览器的拼写波浪线`}
              value={settings.spellCheck}
              onChange={(spellCheck) => patch({ spellCheck })}
            />
            <Toggle
              name="自动配对"
              hint={`输入括号引号时补上另一半`}
              value={settings.autoPair}
              onChange={(autoPair) => patch({ autoPair })}
            />
            <Toggle
              name="智能列表"
              hint={`回车自动延续列表与引用前缀`}
              value={settings.smartLists}
              onChange={(smartLists) => patch({ smartLists })}
            />
            <Row name="Tab 宽度">
              <input
                className="field field--num"
                type="number"
                min={2}
                max={8}
                value={settings.tabSize}
                onChange={(e) => patch({ tabSize: clamp(Number(e.target.value), 2, 8) })}
              />
              <span className="row__hint">空格</span>
            </Row>
          </section>}

          {section === 'images' && <section className="section">
            <div className="section__head">
              <h3 className="section__title">图片</h3>
              <button
                className="section__reset"
                onClick={() =>
                  reset([
                    'imageNaming',
                    'imageDedupe',
                    'imageMaxWidth'
                  ])
                }
              >
                恢复默认
              </button>
            </div>

            <Row
              name="文件命名"
              hint={`${IMAGE_NAMINGS.find((n) => n.value === settings.imageNaming)?.hint}`}
            >
              <Segmented
                items={IMAGE_NAMINGS}
                value={settings.imageNaming}
                onChange={(imageNaming) => patch({ imageNaming })}
              />
            </Row>

            <Toggle
              name="重复图片去重"
              hint={`内容相同的图片只存一份，复用已有文件`}
              value={settings.imageDedupe}
              onChange={(imageDedupe) => patch({ imageDedupe })}
            />

            <Row name="最大宽度" hint={`超过这个宽度会缩放后写入`}>
              <input
                className="field field--num"
                type="number"
                min={0}
                max={4000}
                step={40}
                value={settings.imageMaxWidth}
                onChange={(e) =>
                  patch({ imageMaxWidth: clamp(Number(e.target.value), 0, 4000) })
                }
              />
              <span className="row__hint">px，0 = 不限制</span>
            </Row>
          </section>}
          {section === 'shortcuts' && <ShortcutsSettings />}
        </div>
        </div>

        <footer className="panel__foot">
          <span>设置即时生效并保存</span>
          <span>快捷键按功能分类，可搜索</span>
        </footer>
      </div>
    </div>
  )
}

function Row({
  name,
  hint,
  children
}: {
  name: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="row">
      <span className="row__label">
        <span className="row__name">{name}</span>
        {hint && <span className="row__hint">{hint}</span>}
      </span>
      <span className="row__control">{children}</span>
    </div>
  )
}

function Segmented<T extends string>({
  items,
  value,
  onChange
}: {
  items: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <span className="seg">
      {items.map((item) => (
        <button
          key={item.value}
          className={`seg__item ${item.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </span>
  )
}

function Toggle({
  name,
  hint,
  value,
  onChange
}: {
  name: string
  hint: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="row">
      <span className="row__label">
        <span className="row__name">{name}</span>
        <span className="row__hint">{hint}</span>
      </span>
      <span className="row__control">
        <button
          className={`switch ${value ? 'is-on' : ''}`}
          role="switch"
          aria-checked={value}
          aria-label={name}
          onClick={() => onChange(!value)}
        />
      </span>
    </div>
  )
}

/**
 * Font overrides set a CSS variable on the document root so the sample line
 * below re-renders in the candidate face immediately — choosing a font blind
 * is the whole reason people leave these fields empty.
 */
function FontRow({
  name,
  value,
  cssVar,
  sample,
  onChange
}: {
  name: string
  value: string | null
  cssVar: string
  sample: string
  onChange: (v: string | null) => void
}): JSX.Element {
  const apply = (raw: string): void => {
    const next = raw.trim()
    onChange(next === '' ? null : next)
  }

  return (
    <div className="row row--stack">
      <span className="row__label">
        <span className="row__name">{name}</span>
        <span className="row__hint">留空则使用内置字体栈</span>
      </span>
      <span className="row__control" style={{ width: '100%' }}>
        <input
          className="field field--grow"
          value={value ?? ''}
          aria-label={name}
          placeholder="输入本机字体名称；留空使用默认"
          spellCheck={false}
          onChange={(e) => apply(e.target.value)}
        />
      </span>
      <span className="sample" style={{ fontFamily: `var(${cssVar})` }}>
        {sample}
      </span>
    </div>
  )
}

/**
 * The accent is one value to the user and five tokens to the stylesheet, so a
 * user's colour has to repaint hover, press and selection too — setting
 * `--accent` alone leaves the old terracotta on everything interactive.
 * Mirrors the derivation in App.tsx, which owns the same tokens on startup;
 * here it is only so the change is visible before the next launch.
 * `CSS.supports` rejects a half-typed hex, which is the common case while
 * someone is still typing.
 */
function setAccent(raw: string, patch: (p: Partial<AppSettings>) => void): void {
  const value = raw.trim()
  const root = document.documentElement
  const tokens = ['--accent', '--accent-hover', '--accent-press', '--accent-soft', '--accent-line']
  if (value && CSS.supports('color', value)) {
    root.style.setProperty('--accent', value)
    root.style.setProperty('--accent-hover', `color-mix(in srgb, ${value} 88%, white)`)
    root.style.setProperty('--accent-press', `color-mix(in srgb, ${value} 88%, black)`)
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${value} 16%, transparent)`)
    root.style.setProperty('--accent-line', `color-mix(in srgb, ${value} 34%, transparent)`)
  } else if (value === '') {
    for (const token of tokens) root.style.removeProperty(token)
  }
  patch({ accentOverride: value === '' ? null : value })
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
