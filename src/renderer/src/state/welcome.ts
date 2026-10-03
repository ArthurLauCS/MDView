import { WELCOME_DOC_REL } from '@shared/skills'
import { openDocument } from './documents'
import { openWorkspacePath } from './workspace'

/**
 * Unpack and open the bundled welcome document.
 *
 * The main process copies the folder into the user's documents on first use,
 * because a packaged app's resources directory is read-only and the document
 * needs writable space for the images the user will add to it.
 *
 * Returns false when the build has no bundle, which is a normal state for a
 * development checkout rather than an error worth surfacing.
 */
export async function resolveWelcome(): Promise<boolean> {
  const docPath = await window.mdview.app.resolveStock(WELCOME_DOC_REL)
  if (!docPath) return false
  await openWorkspacePath(docPath.replace(/[\\/][^\\/]+$/, ''))
  await openDocument(docPath)
  return true
}
