import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings, type Locale } from '@shared/types'
import { setLanguage } from '../i18n'

/** Plain JSON settings file in userData. No schema lib — the shape is small. */
export class SettingsService {
  private readonly file: string
  private cache: AppSettings

  constructor(userDataDir: string, private readonly defaultLanguage: Locale = 'zh-CN') {
    mkdirSync(userDataDir, { recursive: true })
    this.file = join(userDataDir, 'settings.json')
    this.cache = this.load()
    setLanguage(this.cache.language)
  }

  private load(): AppSettings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>
      return { ...DEFAULT_SETTINGS, language: this.defaultLanguage, ...raw }
    } catch {
      return { ...DEFAULT_SETTINGS, language: this.defaultLanguage }
    }
  }

  get(): AppSettings {
    return this.cache
  }

  patch(patch: Partial<AppSettings>): AppSettings {
    this.cache = { ...this.cache, ...patch }
    setLanguage(this.cache.language)
    writeFileSync(this.file, JSON.stringify(this.cache, null, 2), 'utf8')
    return this.cache
  }
}
