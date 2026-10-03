import { DEFAULT_SETTINGS, type AppSettings, type DocLayout, type MotionLevel, type PlainMdImagePolicy, type ThemeMode } from '@shared/types'
import { usePatchSettings, useSettings } from '../state/settings'

interface Props {
  onClose: () => void
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

const LAYOUTS: { value: DocLayout; label: string; hint: string }[] = [
  { value: 'flat', label: '平铺', hint: '文档与资源文件夹同级，目录树更扁' },
  { value: 'nested', label: '嵌套', hint: '文档装进同名文件夹，一篇一层目录' }
]

const IMAGE_POLICIES: { value: PlainMdImagePolicy; label: string; hint: string }[] = [
  { value: 'alt-placeholder', label: '保留占位', hint: '图片变成 *[图：alt]* 形式的斜体说明' },
  { value: 'drop', label: '整行删除', hint: '图片所在的行直接去掉' },
  { value: 'empty-ref', label: '保留空引用', hint: '留下 ![]()，之后可重新插图' }
]

export function SettingsPanel({ onClose }: Props): JSX.Element {
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
        className="panel"
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

        <div className="panel__body">
          <section className="section">
            <div className="section__head">
              <h3 className="section__title">外观</h3>
              <button
                className="section__reset"
                onClick={() => reset(['theme', 'motion', 'fontSize', 'measure', 'fontUi', 'fontRead', 'fontCode'])}
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

            <Row name="行长上限" hint="正文一行最多容纳的字符宽度，窗口再宽也不突破">
              <input
                className="field field--num"
                type="number"
                min={48}
                max={110}
                value={settings.measure}
                onChange={(e) => patch({ measure: clamp(Number(e.target.value), 48, 110) })}
              />
              <span className="row__hint">ch</span>
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
            <FontRow
              name="代码字体"
              value={settings.fontCode}
              cssVar="--font-code"
              sample="const value = 42 // 等宽 Aa"
              onChange={(fontCode) => patch({ fontCode })}
            />
          </section>

          <section className="section">
            <div className="section__head">
              <h3 className="section__title">文档</h3>
              <button
                className="section__reset"
                onClick={() => reset(['docLayout', 'plainMdImagePolicy'])}
              >
                恢复默认
              </button>
            </div>

            <Row
              name="目录结构"
              hint={LAYOUTS.find((l) => l.value === settings.docLayout)?.hint}
            >
              <Segmented
                items={LAYOUTS}
                value={settings.docLayout}
                onChange={(docLayout) => patch({ docLayout })}
              />
            </Row>

            <div className="layout-diagram">
              <span
                className={`layout-diagram__item ${settings.docLayout === 'flat' ? 'is-active' : ''}`}
              >
                {'我的笔记/\n├── 我的笔记.md\n└── 我的笔记_img/'}
              </span>
              <span
                className={`layout-diagram__item ${settings.docLayout === 'nested' ? 'is-active' : ''}`}
              >
                {'我的笔记/\n└── 我的笔记/\n    ├── 我的笔记.md\n    └── img/'}
              </span>
            </div>

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
          </section>

          <section className="section">
            <div className="section__head">
              <h3 className="section__title">编辑器</h3>
              <button
                className="section__reset"
                onClick={() =>
                  reset(['typewriterMode', 'highlightCurrentLine', 'readOnly', 'sidebarVisible', 'outlineVisible'])
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
              hint="源码视图拒绝编辑，文档仅用于阅读"
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
              hint="右侧的标题结构面板"
              value={settings.outlineVisible}
              onChange={(outlineVisible) => patch({ outlineVisible })}
            />
          </section>
        </div>

        <footer className="panel__foot">
          <span>设置即时生效并存盘，没有保存按钮</span>
          <span>%APPDATA%/mdview/settings.json</span>
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
    document.documentElement.style.setProperty(cssVar, next ? `"${next}", ${fallbackFor(cssVar)}` : '')
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
          placeholder="例如：Source Han Serif SC"
          spellCheck={false}
          onChange={(e) => apply(e.target.value)}
        />
      </span>
      <span className="sample" style={{ fontFamily: value ? `"${value}"` : undefined }}>
        {sample}
      </span>
    </div>
  )
}

function fallbackFor(cssVar: string): string {
  if (cssVar === '--font-code') return 'monospace'
  if (cssVar === '--font-read') return 'serif'
  return 'sans-serif'
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
