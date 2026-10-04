# 更新记录

## 0.2.0 · 2026-10-04

### 简体中文

- 产品更名为 **MDWisp**，保留图标、既有设置、历史数据和 AI 命令标识。
- 修复 Ctrl+点击跳转：支持相对 Markdown 文件、网址、邮箱、标题锚点、参考式链接、表格内链接和带链接图片。
- 新增 550 条完整配对的中英界面文案；设置中即时切换，重启后保留，切换时保留编辑内容、光标和撤销记录。
- 提供中英 README、欢迎文档、AI 规则和安装器；技能包包含两种语言。
- 修复移除链接误改相邻文字、表格参考式链接和图片无法渲染，以及图片侧栏误读代码示例的问题。
- 补充 [Markdown 语法支持清单](docs/markdown-support.md)，明确数学公式、Mermaid 等扩展目前仅显示源码。
- 417 项单元测试、类型检查、71 个快捷键及真实 Electron 编辑和打包导出回归通过。

### English

- Renamed the product to **MDWisp**, preserving its icon, existing settings, history and AI command identifiers.
- Fixed Ctrl+click navigation for relative Markdown files, websites, email, heading anchors, reference links, table links and linked images.
- Added 550 paired English/Simplified Chinese messages, immediate language switching and persistence without resetting text, cursor or undo history.
- Added bilingual READMEs, welcome documents, AI rules and installer languages; the skills archive includes both languages.
- Fixed unlinking adjacent text, reference links/images inside tables, and image examples incorrectly appearing in the asset sidebar.
- Added a [Markdown support matrix](docs/markdown-support.md); math and Mermaid remain source-only.
- Verified 417 unit tests, both TypeScript projects, 71 keyboard shortcuts, native Electron editing and packaged exports.

## 0.1.2 · 2026-10-03

首次公开发行，提供 Windows x64 安装包和独立 AI 技能包。

### 写作与界面

- 单页实时编辑；启动即可输入，首次保存时选择位置，未命名草稿不自动保存。
- 正文和图片随窗口伸缩；左右边距和侧栏宽度可拖动调整。
- 大纲按标题层级折叠，点击定位到编辑区域顶部；历史版本在右侧展开。
- 修复三个反引号输入后的光标问题，回车创建代码块，代码块下方可继续输入正文。
- 代码语言自动检测，悬停或编辑时显示语言选择器，支持手动选择和撤销。
- 右键二级菜单独立展开，靠近窗口边缘时自动调整方向，支持鼠标与键盘导航。

### 快捷键、导出与 AI

- 修复 Windows 中文输入法下部分组合键无响应，以及 Shift 加数字键的匹配问题。
- 导出快捷键覆盖设置、历史等面板获得焦点的场景。
- 修复安装包缺少导出样式和字体资源的问题；验证 HTML、PDF、Markdown 与 ZIP 导出。
- Codex 与 Cursor 可从应用安装同源的项目级技能；Claude Code 支持本地或 GitHub 插件市场安装。

### 验证

- 357 个单元测试与主进程、渲染进程类型检查通过。
- 71 个快捷键完成实际按键回归；代码块、鼠标定位、右键菜单和侧栏调整完成交互验证。
- 打包后的应用完成四种导出与技能安装检查。

已知限制和未接入的表格动作见[项目状态](docs/STATUS.md)。
