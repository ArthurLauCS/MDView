import { t } from '../i18n'
/**
 * Asset references for the current document.
 *
 * The stripping rule below is a deliberate mirror of `previewPlainMd` in
 * `src/main/services/export.ts` — the panel previews what an export would do,
 * so a second, slightly different rule set would be actively misleading. The
 * two should eventually collapse into one function in `src/shared/`.
 */

import type { AssetRef, PlainMdImagePolicy } from '@shared/types'

export function refreshRefs(docPath: string, source: string): Promise<AssetRef[]> {
  return window.mdview.asset.list(docPath, source)
}

export function findMissing(refs: AssetRef[]): AssetRef[] {
  return refs.filter((r) => !r.exists)
}

export function findOutsideFolder(refs: AssetRef[]): AssetRef[] {
  return refs.filter((r) => !r.insideDocFolder)
}

/** Same pattern as the exporter, so both agree on what counts as an image. */
const IMG = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/

function isRemote(target: string): boolean {
  return /^(https?:)?\/\//.test(target) || target.startsWith('data:')
}

/**
 * Rewrite image links for a portable copy, using the settings policy.
 *
 * Local images are the only ones touched here: a remote or `data:` image
 * survives a copy to another machine intact, so stripping it would be lossy
 * for no reason.
 */
export function stripLocalImages(source: string, policy: PlainMdImagePolicy): string {
  const kept: string[] = []

  for (const line of source.split(/\r?\n/)) {
    const local = [...line.matchAll(new RegExp(IMG, 'g'))].filter((m) => !isRemote(m[2]))

    if (local.length === 0) {
      kept.push(line)
      continue
    }

    if (policy === 'drop') {
      // The exporter drops the whole line, prose included; matching that is
      // the point, even though it is the bluntest of the three policies.
      continue
    }

    let next = line
    for (const m of local) {
      const alt = m[1]
      const replacement =
        policy === 'alt-placeholder' ? (alt ? t('*[图：{0}]*', alt) : t('*[图片]*')) : '![]()'
      next = next.split(m[0]).join(replacement)
    }
    kept.push(next)
  }

  return kept.join('\n')
}
