import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

/** Plain JSON settings file in userData. No schema lib — the shape is small. */
export class SettingsService {
  private readonly file: string
  private cache: AppSettings

  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true })
    this.file = join(userDataDir, 'settings.json')
    this.cache = this.load()
  }

  private load(): AppSettings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>
      return { ...DEFAULT_SETTINGS, ...raw }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  get(): AppSettings {
    return this.cache
  }

  patch(patch: Partial<AppSettings>): AppSettings {
    this.cache = { ...this.cache, ...patch }
    writeFileSync(this.file, JSON.stringify(this.cache, null, 2), 'utf8')
    return this.cache
  }
}
