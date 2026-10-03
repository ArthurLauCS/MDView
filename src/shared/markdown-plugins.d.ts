/**
 * The markdown-it plugin family ships untyped. Rather than pull @types for
 * each one, declare the shape we actually use: a plugin is a function that
 * receives the parser instance.
 */
declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginWithOptions<{
    enabled?: boolean
    label?: boolean
    labelAfter?: boolean
  }>
  export default plugin
}
