import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { BUNDLED_SKILLS } from './index'

const CHECK = resolve(__dirname, '../../../plugin/mdview/skills/doc/scripts/check.mjs')
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'

let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'mdview-plugin-'))
})
afterEach(() => fs.rm(root, { recursive: true, force: true }))

async function folder(md: string, files: Record<string, string> = {}): Promise<string> {
  const dir = join(root, '方案')
  await fs.mkdir(join(dir, '方案_img'), { recursive: true })
  await fs.writeFile(join(dir, '方案.md'), md)
  for (const [name, data] of Object.entries(files)) await fs.writeFile(join(dir, '方案_img', name), data)
  if (Object.keys(files).length === 0) await fs.rmdir(join(dir, '方案_img'))
  return dir
}

function check(...args: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8' })
  return { status: result.status, out: result.stdout + result.stderr }
}

describe('plugin check script', () => {
  it('passes a self-contained folder and ignores images shown as code', async () => {
    const dir = await folder(
      '# 方案\n\n![流程](./方案_img/流程.svg)\n\n```md\n![例](C:/x.png)\n```\n行内 `![例](./没有.png)`\n',
      { '流程.svg': SVG }
    )
    expect(check(dir)).toMatchObject({ status: 0 })
    expect(check(join(dir, '方案.md')).out).toContain('1 张图片')
  })

  it('reports every way a folder stops being portable', async () => {
    const dir = await folder(
      [
        '![a](C:/Users/me/a.png)',
        '![b](data:image/png;base64,AAAA)',
        '![c](./方案_img/没有.svg)',
        '![d](./别处/d.png)',
        '![e](./方案_img/外链.svg)'
      ].join('\n'),
      { '外链.svg': SVG.replace('<rect', '<image href="https://example.com/x.png"/><rect'), '多余.svg': SVG }
    )
    const { status, out } = check(dir)
    expect(status).toBe(1)
    for (const text of ['绝对路径', 'base64', '文件不存在', '图片应放在 ./方案_img/', '外部资源', '多余.svg：没有被文档引用']) {
      expect(out).toContain(text)
    }
  })

  it('enforces the shape of the folder and the no-image mode', async () => {
    const dir = await folder('![流程](./方案_img/流程.svg)\n', { '流程.svg': SVG })
    expect(check(dir, '--no-images').status).toBe(1)

    await fs.writeFile(join(root, '散装.md'), '# 散装\n')
    const loose = check(join(root, '散装.md'))
    expect(loose.status).toBe(1)
    expect(loose.out).toContain('不在同名文件夹里')
  })

  it('accepts the welcome document the app ships', () => {
    expect(check(resolve(__dirname, '../../../stock/欢迎使用'))).toMatchObject({ status: 0 })
    expect(check(resolve(__dirname, '../../../stock/Welcome'))).toMatchObject({ status: 0 })
  })
})

describe('bundled rules', () => {
  it('come from the plugin files with their front matter removed', () => {
    for (const skill of BUNDLED_SKILLS) {
      expect(skill.body.startsWith('# ')).toBe(true)
      expect(skill.body).not.toContain('description:')
      expect(skill.bodyEn.startsWith('# ')).toBe(true)
      expect(skill.bodyEn).not.toContain('description:')
    }
  })
})
