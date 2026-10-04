import { currentLanguage, t } from '../i18n'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/** Install the same rules for both clients, without replacing project instructions. */
export async function installSkills(pluginRoot: string, project: string): Promise<string> {
  const targetRoot = join(project, '.agents', 'skills')
  const files: { path: string; content: Buffer }[] = []
  for (const skill of ['doc', 'share']) {
    const source = join(pluginRoot, 'mdview', 'skills', skill)
    const target = join(targetRoot, `mdview-${skill}`)
    const body = (await fs.readFile(join(source, currentLanguage() === 'en' ? 'SKILL.en.md' : 'SKILL.md'), 'utf8')).replace(/^name: (doc|share)$/m, `name: mdview-${skill}`)
    files.push({ path: join(target, 'SKILL.md'), content: Buffer.from(body) })
    if (skill === 'doc') files.push({ path: join(target, 'scripts', 'check.mjs'), content: await fs.readFile(join(source, 'scripts', 'check.mjs')) })
  }
  // Check every destination before writing anything: custom edits must survive.
  for (const file of files) {
    const existing = await fs.readFile(file.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (existing && !existing.equals(file.content)) throw new Error(t('已有不同内容，请先备份并移走后重试：{0}', file.path))
  }
  for (const file of files) {
    await fs.mkdir(join(file.path, '..'), { recursive: true })
    await fs.writeFile(file.path, file.content, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
  }
  return targetRoot
}
