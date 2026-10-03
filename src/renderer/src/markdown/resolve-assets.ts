/**
 * Point a rendered document's local images at the `mdasset://` scheme.
 *
 * A relative path in the markdown resolves against the app bundle when the
 * view loads it, not against the document — so an untouched `<img src="./x_img/a.png">`
 * either 404s or, at best, loads the wrong file. Rewriting to an absolute
 * path served through our own protocol is what makes a document folder
 * portable and viewable at the same time.
 *
 * Remote and inline images are left exactly as they are; the document does
 * not own them and rewriting them would break them.
 */

const LOCAL_IMAGE = /(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi

function isLocal(src: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false
  if (src.startsWith('//')) return false
  return true
}

function toAssetUrl(docDir: string, rel: string): string {
  // Strip any query or fragment before joining — they belong to the URL, not
  // the filename, and would otherwise become part of the path.
  const [pathPart, suffix] = splitSuffix(rel)
  const decoded = safeDecode(pathPart)
  const abs = joinPath(docDir, decoded)
  return `mdasset://local/${encodeURI(abs).replace(/#/g, '%23')}${suffix}`
}

/** Forward slashes only, and no traversal above the filesystem root. */
function joinPath(dir: string, rel: string): string {
  const isAbsolute = /^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith('/')
  const base = isAbsolute ? '' : dir.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = `${base}/${rel}`.replace(/\\/g, '/').split('/')
  const out: string[] = []

  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  const joined = out.join('/')
  return /^[a-zA-Z]:/.test(joined) ? joined : `/${joined}`
}

function splitSuffix(value: string): [string, string] {
  const at = value.search(/[?#]/)
  return at === -1 ? [value, ''] : [value.slice(0, at), value.slice(at)]
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Rewrite every local image in a rendered fragment. */
export function resolveDocumentAssets(html: string, docDir: string | null): string {
  if (!docDir) return html
  return html.replace(LOCAL_IMAGE, (_match, head: string, quote: string, src: string) => {
    if (!isLocal(src)) return `${head}${quote}${src}${quote}`
    return `${head}${quote}${toAssetUrl(docDir, src)}${quote}`
  })
}

/** The same rewrite for a single path, used when previewing one image. */
export function assetUrlFor(docDir: string, rel: string): string {
  return toAssetUrl(docDir, rel)
}
