/**
 * The renderer's view of the shared pipeline.
 *
 * The implementation moved to `src/shared/markdown/pipeline.ts` so export can
 * use it too; this stays as the renderer's entry point so call sites and the
 * `@/markdown/render` alias keep working.
 */
export { renderMarkdown } from '@shared/markdown/pipeline'
