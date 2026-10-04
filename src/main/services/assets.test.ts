import { describe, expect, it, vi } from 'vitest'
import { AssetService } from './assets'
import { DocumentService } from './documents'
import type { SettingsService } from './settings'
import type { WorkspaceService } from './workspace'

vi.mock('electron', () => ({ nativeImage: {} }))

describe('document image references', () => {
  it('ignores fenced and inline examples while retaining actual Markdown and HTML images', async () => {
    const assets = new AssetService({} as WorkspaceService, new DocumentService(), {} as SettingsService)
    const source = '![real](./real.png)\n\n```md\n![example](./example.png)\n```\n\n`![inline](./inline.png)`\n\n<img src="./html.png">'
    const refs = await assets.refs('notes/notes.md', source)
    expect(refs.map(ref => ref.relPath)).toEqual(['./real.png', './html.png'])
  })
})
