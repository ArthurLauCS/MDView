import { en } from '@shared/locales/en'
import { zhCN, type MessageKey } from '@shared/locales/zh-CN'
import type { Locale } from '@shared/types'

let language: Locale = 'zh-CN'

export function setLanguage(value: Locale): void { language = value }
export function currentLanguage(): Locale { return language }

export function t(key: string, ...values: unknown[]): string {
  const messages = language === 'en' ? en : zhCN
  return (messages[key as MessageKey] ?? key).replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)]))
}
