import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, searchPanelOpen, setSearchQuery } from '@codemirror/search'

function navigate(view: EditorView, previous: boolean): void {
  if (!searchPanelOpen(view.state)) {
    const query = getSearchQuery(view.state)
    openSearchPanel(view)
    if (query.valid) view.dispatch({ effects: setSearchQuery.of(query) })
  }
  if (previous) findPrevious(view)
  else findNext(view)
}

export const searchCommands = {
  open: openSearchPanel,
  replace: (view: EditorView) => {
    openSearchPanel(view)
    view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')?.focus()
  },
  next: (view: EditorView) => navigate(view, false),
  previous: (view: EditorView) => navigate(view, true),
  close: closeSearchPanel
}

export type SearchCommand = keyof typeof searchCommands

export const searchChinese = EditorState.phrases.of({
  Find: '查找', Replace: '替换', next: '下一个', previous: '上一个', all: '全选匹配',
  'match case': '区分大小写', regexp: '正则表达式', 'by word': '全字匹配',
  replace: '替换', 'replace all': '全部替换', close: '关闭',
  'current match': '当前匹配', 'replaced match on line $': '已替换第 $ 行的匹配',
  'replaced $ matches': '已替换 $ 处匹配', 'on line': '所在行'
})
