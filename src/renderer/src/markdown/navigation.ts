import { t } from '../i18n'
import type { ActionContext } from '../actions/types'
import { documentError, openDocument } from '../state/documents'
import { extractHeadings } from '../outline/headings'

export function jumpToFragment(ctx: ActionContext, fragment: string): void {
  const heading = extractHeadings(ctx.source).find(h => decodeURIComponent(h.id) === fragment)
  if (heading) ctx.jump?.(heading.offset)
  else if (!fragment) ctx.jump?.(0)
  else ctx.toast(t('找不到链接指向的标题'), 'error')
}

export async function followDocumentLink(ctx: ActionContext, href: string): Promise<void> {
  try {
    const target = await window.mdview.doc.resolveLink(ctx.docPath ?? '', href)
    if (target.kind === 'external') await window.mdview.shell.openExternal(target.url)
    else if (target.path === (ctx.docPath ?? '')) jumpToFragment(ctx, target.fragment)
    else await openDocument(target.path, target.fragment)
  } catch (error) { documentError(error) }
}
