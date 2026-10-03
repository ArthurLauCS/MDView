import { resolve } from 'node:path'

/**
 * The document a launch was asked to open.
 *
 * Explorer passes a double-clicked file as an argument, but its position is
 * not fixed: Chromium appends its own switches, and a development launch puts
 * the app directory first. So the extension is the test, not the index.
 */
export function documentArg(argv: string[], cwd: string): string | null {
  const arg = argv.slice(1).reverse().find((a) => /\.(md|markdown|mdx)$/i.test(a))
  return arg ? resolve(cwd, arg) : null
}
