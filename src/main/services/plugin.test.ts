import { afterEach, beforeEach, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { installSkills } from './plugin'
import { setLanguage } from '../i18n'

let root: string
beforeEach(async () => { root = await fs.mkdtemp(join(tmpdir(), 'mdview-skills-')) })
afterEach(() => fs.rm(root, { recursive: true, force: true }))
const plugin = resolve(__dirname, '../../../plugin')

it('installs portable namespaced skills and the working validator for both clients', async () => {
  await fs.writeFile(join(root, 'AGENTS.md'), 'project rules')
  const target = await installSkills(plugin, root)
  expect(target).toBe(join(root, '.agents', 'skills'))
  for (const name of ['doc', 'share']) {
    const source = await fs.readFile(join(plugin, 'mdview', 'skills', name, 'SKILL.md'), 'utf8')
    expect(await fs.readFile(join(target, `mdview-${name}`, 'SKILL.md'), 'utf8')).toBe(source.replace(`name: ${name}`, `name: mdview-${name}`))
  }
  const checked = spawnSync(process.execPath, [join(target, 'mdview-doc/scripts/check.mjs'), resolve(__dirname, '../../../stock/欢迎使用')])
  expect(checked.status).toBe(0)
  await installSkills(plugin, root)
  expect(await fs.readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('project rules')
})

it('refuses custom content before installing any other skill', async () => {
  const dest = join(root, '.agents/skills/mdview-share')
  await fs.mkdir(dest, { recursive: true })
  await fs.writeFile(join(dest, 'SKILL.md'), 'custom')
  await expect(installSkills(plugin, root)).rejects.toThrow('已有不同内容')
  expect(await fs.readFile(join(dest, 'SKILL.md'), 'utf8')).toBe('custom')
  await expect(fs.stat(join(root, '.agents/skills/mdview-doc'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('installs English rules from the plugin source when English is selected', async () => {
  setLanguage('en')
  try {
    const target = await installSkills(plugin, root)
    const body = await fs.readFile(join(target, 'mdview-doc/SKILL.md'), 'utf8')
    expect(body).toContain('# Write a portable document folder')
    expect(body).toContain('name: mdview-doc')
  } finally { setLanguage('zh-CN') }
})
