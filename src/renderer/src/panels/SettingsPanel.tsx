import { DEFAULT_SETTINGS, type AppSettings, type CursorStyle, type DocLayout, type ImageNaming, type MotionLevel, type PlainMdImagePolicy, type ThemeMode } from '@shared/types'
import { usePatchSettings, useSettings } from '../state/settings'
import { openPanel } from '../state/ui'

interface Props {
  onClose: () => void
  onOpenWelcome?: () => void
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


/**
 * `__APP_VERSION__` is a build-time define, so it does not exist when the
 * panel is evaluated outside a Vite build (vitest, a bare tsc run).
 */
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

export function SettingsPanel({ onClose, onOpenWelcome }: Props): JSX.Element {
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
                onClick={() =>
                  reset([
                    'theme',
                    'motion',
                    'fontSize',
                    'measure',
                    'fontUi',
                    'fontRead',
                    'fontCode',
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

            <Row name="代码字号" hint="代码块、行号槽与编辑器正文共用">
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

            <Row name="光标样式" hint="源码视图里插入符的形状">
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
                  reset([
                    'typewriterMode',
                    'highlightCurrentLine',
                    'readOnly',
                    'sidebarVisible',
                    'outlineVisible',
                    'autoSave',
                    'autoSaveDelayMs',
                    'historyEnabled',
                    'historyIntervalMs',
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
            <Toggle
              name="自动保存"
              hint={`停止输入后自动写盘`}
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
              hint="按间隔留下快照，可以随时回看和还原"
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
          </section>

          <section className="section">
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
          </section>

          <section className="section">
            <div className="section__head">
              <h3 className="section__title">帮助</h3>
            </div>

            <Row name="欢迎文档" hint="用本应用写成的说明文档，同时演示文档即文件夹">
              <button
                className="btn btn--primary"
                disabled={!onOpenWelcome}
                onClick={onOpenWelcome}
              >
                打开
              </button>
            </Row>
            {!onOpenWelcome && (
              <p className="panel__note">当前入口没有接入欢迎文档</p>
            )}

            <Row name="快捷键速查表" hint="按分组列出全部命令，可以搜索">
              <button className="btn" onClick={() => openPanel('shortcuts')}>
                打开 F1
              </button>
            </Row>

            <Row name="给 AI 的协作规则" hint="随安装包一起分发，内容与说明见帮助面板">
              <button className="btn" onClick={() => openPanel('help')}>
                打开帮助
              </button>
            </Row>

            <p className="panel__note">
              设置存在 %APPDATA%/mdview/settings.json，版本历史存在
              %APPDATA%/mdview/history/。修改即时写入，没有保存按钮。
            </p>
            <p className="panel__note">MDView {VERSION}</p>
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
