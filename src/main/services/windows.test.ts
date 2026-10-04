import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { SessionService } from './session'
import { DocumentService } from './documents'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'mdwisp-windows-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

it('keeps each window session across reloads and restores the last saved session on restart', async () => {
  const path = join(root, 'doc.md')
  await writeFile(path, '# First')
  const first = new SessionService(root)
  await first.save({ activeDoc: path, workspaceRoot: root })
  const second = new SessionService(root, false)
  expect((await second.load()).activeDoc).toBeNull()
  await second.save({ activeDoc: null })
  expect((await first.load()).activeDoc).toBe(path)
  await Promise.all([first.rememberRoot(root), second.rememberRoot(tmpdir())])
  expect(await first.recentRoots()).toEqual([tmpdir(), root])
  await first.save({ activeDoc: path })
  expect((await new SessionService(root).load()).activeDoc).toBe(path)
})

it('rejects a stale simultaneous save without overwriting another window', async () => {
  const path = join(root, 'doc.md')
  await writeFile(path, '# Original')
  const documents = new DocumentService()
  const results = await Promise.allSettled([
    documents.write(path, '# First edit', '# Original'),
    documents.write(path, '# Second edit', '# Original')
  ])
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(await readFile(path, 'utf8')).toBe('# First edit')
  await documents.write(path, '# Next edit', '# First edit')
  expect(await readFile(path, 'utf8')).toBe('# Next edit')
})
