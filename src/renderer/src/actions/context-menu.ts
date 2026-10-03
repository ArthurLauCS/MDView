import { GROUPS, GROUP_LABELS, ACTIONS, type GroupId } from './registry'
import { prettyKey } from './keymap'
import type { ActionContext, ActionDef, ActionScope } from './types'

export interface MenuItem {
  kind: 'action'
  id: string
  title: string
  shortcut?: string
  disabled: boolean
  reason?: string
}

export interface MenuSeparator {
  kind: 'separator'
}

export interface MenuSubmenu {
  kind: 'submenu'
  title: string
  items: MenuItem[]
}

export type MenuEntry = MenuItem | MenuSeparator | MenuSubmenu

export interface MenuTarget {
  scope: ActionScope
  /** Present on hover in the rendered document. */
  imageSrc?: string
  linkHref?: string
  /** Rendered heading text, for the outline-style link submenu. */
  headings?: { text: string; id: string }[]
}

/**
 * Which scopes are reachable from a given click target. The menu shows a
 * superset of the editor's own scope so that right-clicking a table cell
 * still offers formatting, which is what people expect.
 */
function scopesFor(target: MenuTarget): ActionScope[] {
  switch (target.scope) {
    case 'image':
      return ['image', 'clipboard', 'app']
    case 'link':
      return ['link', 'clipboard', 'app']
    case 'table':
    case 'tableColumn':
      return ['table', 'tableColumn', 'format', 'clipboard', 'app']
    case 'codeblock':
      return ['codeblock', 'format', 'clipboard', 'app']
    case 'selection':
      // A right-click on selected text is the one place where nearly every
      // family is legitimately reachable.
      return [
        'selection',
        'document',
        'format',
        'convert',
        'insert',
        'find',
        'clipboard',
        'app'
      ]
    default:
      return ['document', 'insert', 'clipboard', 'app']
  }
}

/**
 * Build the context menu for a click target.
 *
 * Items are collected per group, then groups with no surviving item are
 * dropped entirely — that is what keeps a right-click on plain prose from
 * showing an empty "表格" heading.
 */
export function buildContextMenu(target: MenuTarget, ctx: ActionContext): MenuEntry[] {
  const allowed = new Set(scopesFor(target))
  const byGroup = new Map<string, ActionDef[]>()

  for (const action of ACTIONS) {
    if (!allowed.has(action.scope)) continue
    // A scope-specific duplicate of a document action would appear twice.
    const list = byGroup.get(action.group) ?? []
    list.push(action)
    byGroup.set(action.group, list)
  }

  const entries: MenuEntry[] = []

  for (const group of GROUPS) {
    const items = byGroup.get(group as GroupId)
    if (!items || items.length === 0) continue

    const rendered: MenuItem[] = items.map((a) => {
      const disabled = a.enabled ? !a.enabled(ctx) : false
      const item: MenuItem = {
        kind: 'action',
        id: a.id,
        title: a.title,
        disabled
      }
      if (a.key) item.shortcut = prettyKey(a.key)
      if (disabled && a.disabledReason) item.reason = a.disabledReason(ctx)
      return item
    })

    if (entries.length > 0) entries.push({ kind: 'separator' })
    entries.push(...rendered)
  }

  // The "convert to" family reads better as a submenu than a dozen siblings.
  const convertAt = entries.findIndex(
    (e) => e.kind === 'action' && e.id.startsWith('heading.')
  )
  if (convertAt > 0) {
    const convertItems = entries.filter(
      (e): e is MenuItem => e.kind === 'action' && e.id.startsWith('heading.')
    )
    const withoutConvert = entries.filter(
      (e) => !(e.kind === 'action' && e.id.startsWith('heading.'))
    )
    const submenu: MenuSubmenu = {
      kind: 'submenu',
      title: GROUP_LABELS.convert,
      items: convertItems
    }
    const anchor = withoutConvert.findIndex((e) => e.kind === 'separator' && convertAt > 0)
    withoutConvert.splice(anchor >= 0 ? anchor + 1 : withoutConvert.length, 0, submenu)
    return withoutConvert
  }

  return entries
}

/** Flatten for keyboard navigation, skipping separators and disabled rows. */
export function navigableIndexes(entries: MenuEntry[]): number[] {
  return entries
    .map((e, i) => (e.kind === 'action' && !e.disabled ? i : -1))
    .filter((i) => i >= 0)
}
