import { markdownLanguage } from '@codemirror/lang-markdown'
import type { SyntaxNode } from '@lezer/common'
import { markdownParser, markdownReferences } from '@shared/markdown/pipeline'
import { frontmatterEnd } from '@shared/markdown/frontmatter'

/** Use the rendering parser for escaping, titles, autolinks and reference labels. */
export function linkResolver(source: string, references = markdownReferences(source)): (node: SyntaxNode) => string | null {
  return (node) => {
    if (!['Link', 'Autolink', 'URL'].includes(node.name)) return null
    const tokens = markdownParser.parseInline(source.slice(node.from, node.to), { references })
    return tokens[0]?.children?.find(token => token.type === 'link_open')?.attrGet('href') ?? null
  }
}

function linkNodeAt(source: string, offset: number): SyntaxNode | null {
  const tree = markdownLanguage.parser.parse(source)
  if (offset < frontmatterEnd(source)) return null
  for (let node: SyntaxNode | null = tree.resolveInner(offset, 1); node; node = node.parent) {
    if (['FencedCode', 'CodeBlock', 'InlineCode', 'Image', 'LinkReference'].includes(node.name)) return null
    if (node.name === 'Link' || node.name === 'Autolink' || node.name === 'URL') {
      if (node.name === 'URL' && ['Link', 'Autolink', 'Image', 'LinkReference'].includes(node.parent?.name ?? '')) continue
      return node
    }
  }
  return null
}

export function linkAt(source: string, offset: number): string | null {
  const node = linkNodeAt(source, offset)
  return node ? linkResolver(source)(node) : null
}

export function unlinkAt(source: string, offset: number): { from: number; to: number; text: string } | null {
  const node = linkNodeAt(source, offset)
  if (node?.name !== 'Link' || linkResolver(source)(node) === null) return null
  const [open, close] = node.getChildren('LinkMark')
  return { from: node.from, to: node.to, text: source.slice(open.to, close.from) }
}
