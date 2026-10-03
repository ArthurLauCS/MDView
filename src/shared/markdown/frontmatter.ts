/**
 * Length of a leading YAML front matter block, 0 when there is none.
 *
 * Neither markdown parser knows front matter: both read the closing `---` as a
 * setext underline and turn the last metadata line into a heading.
 */
export function frontmatterEnd(source: string): number {
  return /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(source)?.[0].length ?? 0
}
