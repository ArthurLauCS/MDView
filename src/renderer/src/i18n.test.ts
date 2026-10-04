import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '@shared/locales/en'
import { zhCN } from '@shared/locales/zh-CN'
import { DEFAULT_SETTINGS } from '@shared/types'
import { patchSettings } from './state/settings'
import { t } from './i18n'
import { findAction } from './actions/registry'

afterEach(async () => {
  await patchSettings({ language: 'zh-CN' })
  vi.unstubAllGlobals()
})

describe('language packs', () => {
  it('covers the same messages with matching placeholders', () => {
    vi.stubGlobal('window', { mdview: { settings: { patch: async () => DEFAULT_SETTINGS } } })
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort())
    for (const key of Object.keys(zhCN) as (keyof typeof zhCN)[]) {
      expect(en[key].trim(), key).not.toBe('')
      expect(en[key].match(/\{\d+\}/g)?.sort() ?? [], key).toEqual(zhCN[key].match(/\{\d+\}/g)?.sort() ?? [])
      expect(en[key], key).not.toMatch(/\p{Script=Han}/u)
    }
  })
  it('switches existing actions and interpolated messages immediately', async () => {
    vi.stubGlobal('window', { mdview: { settings: { patch: async () => DEFAULT_SETTINGS } } })
    const actions = ['document.new', 'format.bold', 'prefix.quote', 'heading.2', 'table.row.insertAbove'].map(findAction)
    await patchSettings({ language: 'en' })
    expect(actions.map(a => a?.title)).toEqual(['New document', 'Bold', 'Blockquote', 'Heading H2', 'Insert row above'])
    expect(t('第 {0} 行，第 {1} 列', 3, 2)).toBe('Row 3, column 2')
    await patchSettings({ language: 'zh-CN' })
    expect(actions[0]?.title).toBe('新建文档')
  })
})
