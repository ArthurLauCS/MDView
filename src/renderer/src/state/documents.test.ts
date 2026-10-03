import { beforeEach, describe, expect, it, vi } from 'vitest'

const meta = (path: string) => ({ id: path, path, stem: path.split('/').pop()!, parentDir: '/notes', assetDir: '/notes/img', layout: 'flat' as const })
let documents: typeof import('./documents')
let bridge: any

beforeEach(async () => {
  vi.resetModules()
  bridge = {
    doc: {
      read: vi.fn(async (path: string) => ({ meta: meta(path), text: '# Saved', body: '# Saved', frontmatter: null, conflictWithDisk: false })),
      write: vi.fn(async (path: string) => meta(path))
    },
    dialog: { saveFile: vi.fn(async () => '/notes/draft.md'), confirmSave: vi.fn(async () => 'cancel'), openDocument: vi.fn(async () => null) },
    history: { record: vi.fn(async () => null) }
  }
  vi.stubGlobal('window', { mdview: bridge })
  documents = await import('./documents')
})

describe('document lifecycle', () => {
  it('keeps a new draft in memory until the first explicit save', async () => {
    await documents.newDocument()
    documents.updateDocumentBuffer('草稿 English\n第二行')
    expect(documents.currentDocument()?.meta.path).toBe('')
    expect(bridge.doc.write).not.toHaveBeenCalled()
    expect(bridge.history.record).not.toHaveBeenCalled()
    expect(await documents.saveDocument()).toBe(true)
    expect(bridge.doc.write).toHaveBeenCalledWith('/notes/draft.md', '草稿 English\n第二行')
    expect(documents.currentDocument()?.meta.path).toBe('/notes/draft.md')
    expect(documents.hasUnsavedChanges()).toBe(false)
    documents.updateDocumentBuffer('changed')
    await documents.saveDocument(false)
    expect(bridge.dialog.saveFile).toHaveBeenCalledTimes(1)
  })

  it('preserves a draft when save is cancelled or disk writing fails', async () => {
    await documents.newDocument()
    documents.updateDocumentBuffer('keep me')
    bridge.dialog.saveFile.mockResolvedValueOnce(null)
    expect(await documents.saveDocument()).toBe(false)
    expect(documents.documentBuffer()).toBe('keep me')
    expect(bridge.doc.write).not.toHaveBeenCalled()
    bridge.doc.write.mockRejectedValueOnce(new Error('disk full'))
    expect(await documents.saveDocument()).toBe(false)
    expect(documents.currentDocument()?.meta.path).toBe('')
    expect(documents.hasUnsavedChanges()).toBe(true)
  })

  it('honors cancel, save and discard on document switches', async () => {
    await documents.newDocument()
    documents.updateDocumentBuffer('keep')
    await documents.openDocument('/notes/other.md')
    expect(documents.documentBuffer()).toBe('keep')
    bridge.dialog.confirmSave.mockResolvedValueOnce('save')
    bridge.dialog.saveFile.mockResolvedValueOnce(null)
    await documents.newDocument()
    expect(documents.documentBuffer()).toBe('keep')
    bridge.dialog.confirmSave.mockResolvedValueOnce('save')
    await documents.openDocument('/notes/other.md')
    expect(bridge.doc.write).toHaveBeenCalledWith('/notes/draft.md', 'keep')
    expect(documents.documentBuffer()).toBe('# Saved')
    documents.updateDocumentBuffer('discard')
    bridge.dialog.confirmSave.mockResolvedValueOnce('discard')
    await documents.newDocument()
    expect(documents.documentBuffer()).toBe('')
    expect(bridge.doc.write).toHaveBeenCalledTimes(1)
  })

  it('does not clear newer input or open a second save dialog during a write', async () => {
    await documents.newDocument()
    documents.updateDocumentBuffer('first')
    let finish!: (value: ReturnType<typeof meta>) => void
    bridge.doc.write.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const saving = documents.saveDocument()
    expect(documents.saveDocument()).toBe(saving)
    await vi.waitFor(() => expect(bridge.doc.write).toHaveBeenCalled())
    documents.updateDocumentBuffer('newer')
    finish(meta('/notes/draft.md'))
    await saving
    expect(documents.documentBuffer()).toBe('newer')
    expect(documents.hasUnsavedChanges()).toBe(true)
    expect(bridge.dialog.saveFile).toHaveBeenCalledTimes(1)
  })

  it('retains the current file when opening fails and saves its complete frontmatter', async () => {
    const text = '---\ntitle: metadata\n---\n# Body'
    bridge.doc.read.mockResolvedValueOnce({ meta: meta('/notes/a.md'), text, body: '# Body', frontmatter: { title: 'metadata' }, conflictWithDisk: false })
    await documents.openDocument('/notes/a.md')
    await documents.saveDocument()
    expect(bridge.doc.write).toHaveBeenCalledWith('/notes/a.md', text)
    bridge.doc.read.mockRejectedValueOnce(new Error('file missing'))
    await documents.openDocument('/notes/missing.md')
    expect(documents.currentDocument()?.meta.path).toBe('/notes/a.md')
  })
})
