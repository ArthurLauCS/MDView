import { t } from '../i18n'
import { useMemo, useState } from 'react'
import { ACTIONS, GROUP_LABELS, GROUPS } from '../actions/registry'
import { prettyKey } from '../actions/keymap'
import type { ActionDef, ActionScope } from '../actions/types'
import { useEditorContext } from '../state/editor-context'
import { useSettings } from '../state/settings'

const SCOPE_LABELS: Record<ActionScope, string> = {
  get global() { return t('全局') },
  get app() { return t('全局') },
  get document() { return t('文档') },
  get selection() { return t('选中文本') },
  get format() { return t('文本') },
  get convert() { return t('块类型') },
  get insert() { return t('插入') },
  get find() { return t('查找') },
  get clipboard() { return t('剪贴板') },
  get codeblock() { return t('代码块内') },
  get table() { return t('表格内') },
  get tableColumn() { return t('表格内') },
  get image() { return t('图片上') },
  get link() { return t('链接上') },
  get filetree() { return t('文件树') }
}

interface Row {
  action: ActionDef
  group: string
}

export function ShortcutsSettings(): JSX.Element {
  const { language } = useSettings()
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
  }, [query, category, language])

  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  return (
    <div className="shortcuts-settings">
          <div className="section__head"><h3 className="section__title">{t('快捷键')}</h3>
            <select className="field" aria-label={t('快捷键功能分类')} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">{t('全部功能')}</option>
              {GROUPS.map((id) => <option key={id} value={id}>{GROUP_LABELS[id]}</option>)}
            </select>
          </div>
          <input
            className="field field--grow"
            style={{ width: '100%', marginBottom: 'var(--space-6)' }}
            value={query}
            placeholder={t('搜索命令或按键…')}
            aria-label={t('搜索快捷键')}
            spellCheck={false}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />

          {total === 0 && <p className="panel__empty">{t('没有匹配的命令')}</p>}

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
                          <span className="keys__none">{t('命令面板')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        <footer className="panel__note">
          <span>{t('共 {0} 条', total)}</span>
          <span>{t('表格、代码和图片快捷键需先聚焦对应内容；没有按键的可用命令在 Ctrl+P 中执行')}</span>
        </footer>
    </div>
  )
}
