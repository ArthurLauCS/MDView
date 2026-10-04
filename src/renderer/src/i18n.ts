import { en } from '@shared/locales/en'
import { zhCN, type MessageKey } from '@shared/locales/zh-CN'
import { settingsSnapshot } from './state/settings'

export function t(key: string, ...values: unknown[]): string {
  const messages = settingsSnapshot().language === 'en' ? en : zhCN
  return (messages[key as MessageKey] ?? key).replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)]))
}
