import './welcome.css'

interface Props {
  onOpenFolder: () => void
}

const HIGHLIGHTS = [
  {
    title: '文档即文件夹',
    body: '每个 md 旁边是自己的图片文件夹，路径全是相对的 —— 文件夹拷给谁，谁就能看到图。'
  },
  {
    title: '本地语言检测',
    body: '代码块不带语言名也能高亮。指纹、加权评分、拿不准就明说，绝不硬猜。'
  },
  {
    title: '表格当数据用',
    body: '增删行列、排序、合并、转 CSV/JSON、从 Excel 直接粘 —— 每个操作都有快捷键和右键菜单。'
  }
]

export function Welcome({ onOpenFolder }: Props): JSX.Element {
  return (
    <main className="welcome">
      <div className="welcome__inner">
        <p className="welcome__eyebrow">Markdown 阅读器与编辑器</p>
        <h1 className="welcome__title">MDView</h1>
        <p className="welcome__lede">
          为长文档和大量表格设计的写作工具。深色为主，动效克制，一切可键盘操作。
        </p>

        <button className="welcome__cta" onClick={onOpenFolder}>
          打开一个目录
          <span className="welcome__cta-key">Ctrl+O</span>
        </button>

        <ul className="welcome__grid">
          {HIGHLIGHTS.map((h, i) => (
            <li
              key={h.title}
              className="welcome__card"
              style={{ animationDelay: `${120 + i * 70}ms` }}
            >
              <h2 className="welcome__card-title">{h.title}</h2>
              <p className="welcome__card-body">{h.body}</p>
            </li>
          ))}
        </ul>

        <p className="welcome__foot">
          按 <kbd>Ctrl+P</kbd> 打开命令面板，<kbd>F1</kbd> 查看全部快捷键。
        </p>
      </div>
    </main>
  )
}
