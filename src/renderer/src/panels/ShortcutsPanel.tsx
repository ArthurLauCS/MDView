import { useMemo, useState } from 'react'
import { ACTIONS, GROUP_LABELS, GROUPS } from '../actions/registry'
import { prettyKey } from '../actions/keymap'
import type { ActionDef, ActionScope } from '../actions/types'
import { useEditorContext } from '../state/editor-context'

const SCOPE_LABELS: Record<ActionScope, string> = {
  global: '全局',
  app: '全局',
  document: '文档',
  selection: '选中文本',
  format: '文本',
  convert: '块类型',
  insert: '插入',
  find: '查找',
  clipboard: '剪贴板',
  codeblock: '代码块内',
  table: '表格内',
  tableColumn: '表格内',
  image: '图片上',
  link: '链接上',
  filetree: '文件树'
}

interface Row {
  action: ActionDef
  group: string
}

export function ShortcutsSettings(): JSX.Element {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const { ctx } = useEditorContext()

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = ACTIONS.filter((a) => {
      if (category !== 'all' && a.group !== category) return false
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        (a.key ?? '').toLowerCase().includes(q) ||
        (a.keywords ?? []).some((k) => k.includes(q))
      )
    })

    // Registry order defines group order; a group with no surviving row is
    // dropped rather than shown as an empty heading.
    const byGroup = new Map<string, Row[]>()
    for (const action of matched) {
      const list = byGroup.get(action.group) ?? []
      list.push({ action, group: action.group })
      byGroup.set(action.group, list)
    }

    const ordered = GROUPS.filter((g) => byGroup.has(g)).map((g) => ({
      id: g as string,
      label: GROUP_LABELS[g],
      rows: byGroup.get(g) as Row[]
    }))

    const extra = [...byGroup.keys()].filter((g) => !GROUPS.includes(g as never))
    for (const g of extra) {
      ordered.push({ id: g, label: g, rows: byGroup.get(g) as Row[] })
    }
    return ordered
  }, [query, category])

  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  return (
    <div className="shortcuts-settings">
          <div className="section__head"><h3 className="section__title">快捷键</h3>
            <select className="field" aria-label="快捷键功能分类" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">全部功能</option>
              {GROUPS.map((id) => <option key={id} value={id}>{GROUP_LABELS[id]}</option>)}
            </select>
          </div>
          <input
            className="field field--grow"
            style={{ width: '100%', marginBottom: 'var(--space-6)' }}
            value={query}
            placeholder="搜索命令或按键…"
            aria-label="搜索快捷键"
            spellCheck={false}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />

          {total === 0 && <p className="panel__empty">没有匹配的命令</p>}

          {groups.map((group) => (
            <section className="section" key={group.id}>
              <div className="section__head">
                <h3 className="section__title">{group.label}</h3>
                <span className="row__hint">{group.rows.length}</span>
              </div>
              <table className="keys">
                <tbody>
                  {group.rows.map(({ action }) => (
                    <tr key={action.id} className="keys__row">
                      <td className="keys__title">{action.title}
                        {action.enabled?.(ctx) === false && <span className="row__hint"> · {action.disabledReason?.(ctx)}</span>}
                      </td>
                      <td className="keys__scope">{SCOPE_LABELS[action.scope]}</td>
                      <td className="keys__key">
                        {action.key ? (
                          [action.key, ...(action.altKeys ?? [])].map(key => <kbd className="keys__kbd" key={key}>{prettyKey(key)}</kbd>)
                        ) : (
                          <span className="keys__none">命令面板</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        <footer className="panel__note">
          <span>共 {total} 条</span>
          <span>表格、代码和图片快捷键需先聚焦对应内容；没有按键的可用命令在 Ctrl+P 中执行</span>
        </footer>
    </div>
  )
}
