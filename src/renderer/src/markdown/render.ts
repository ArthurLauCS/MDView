/**
 * The renderer's view of the shared pipeline.
 *
 * The implementation moved to `src/shared/markdown/pipeline.ts` so export can
 * use it too; this stays as the renderer's entry point so call sites and the
 * `@/markdown/render` alias keep working.
 */
import { renderMarkdown as render, type MarkdownReferences } from '@shared/markdown/pipeline'
import { settingsSnapshot } from '../state/settings'

export function renderMarkdown(source: string, references?: MarkdownReferences): string {
  return render(source, settingsSnapshot().language, references)
}
