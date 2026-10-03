import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { documentArg } from './launch'

describe('documentArg', () => {
  it('finds the document among switches, wherever it sits', () => {
    expect(documentArg(['MDView.exe', '--allow-file-access', 'D:/笔记/a.md'], 'C:/')).toBe(resolve('D:/笔记/a.md'))
    expect(documentArg(['electron.exe', '.', 'docs/b.markdown', '--flag'], 'C:/repo')).toBe(resolve('C:/repo', 'docs/b.markdown'))
  })

  it('ignores a launch without a document, and the executable itself', () => {
    expect(documentArg(['MDView.exe'], 'C:/')).toBeNull()
    expect(documentArg(['C:/tools/viewer.md', '--flag'], 'C:/')).toBeNull()
  })
})
