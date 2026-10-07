import doc from '../../../plugin/mdwisp/skills/doc/SKILL.md?raw'
import share from '../../../plugin/mdwisp/skills/share/SKILL.md?raw'
import docEn from '../../../plugin/mdwisp/skills/doc/SKILL.en.md?raw'
import shareEn from '../../../plugin/mdwisp/skills/share/SKILL.en.md?raw'
import { frontmatterEnd } from '../markdown/frontmatter'

export interface BundledSkill {
  id: string
  title: string
  summary: string
  body: string
  bodyEn: string
}

/**
 * Path of the welcome document inside `stock/`. Both the help panel and the
 * settings help section read it from here, so the two cannot disagree about
 * where the document lives.
 */
export const WELCOME_DOC_REL = '欢迎使用/欢迎使用.md'
export const WELCOME_DOC_EN_REL = 'Welcome/Welcome.md'

/**
 * The plugin's skill files are the only copy of these rules. The front
 * matter is Claude Code's; what is left is plain markdown any assistant's
 * rule file accepts.
 */
const rules = (raw: string): string => raw.slice(frontmatterEnd(raw)).trim()

export const BUNDLED_SKILLS: BundledSkill[] = [
  {
    id: 'doc',
    title: '按文档文件夹格式写文档',
    summary:
      '让 AI 把文档写成自带图片的文件夹：图片存进 _img 目录、相对路径引用，可选不生成图片或尽量生成图片。',
    body: rules(doc),
    bodyEn: rules(docEn)
  },
  {
    id: 'share',
    title: '导出可分享的单文件文档',
    summary:
      '剥离本地图片与本地路径，保留远程链接、内嵌图片和代码块原文，逐行处理并在写出前预览。',
    body: rules(share),
    bodyEn: rules(shareEn)
  }
]
