import { IMAGE_TO_DOC_FOLDER } from './image-to-doc-folder'
import { EXPORT_FOR_SHARING } from './export-for-sharing'

export interface BundledSkill {
  id: string
  title: string
  summary: string
  body: string
}

/**
 * Path of the welcome document inside `stock/`. Both the help panel and the
 * settings help section read it from here, so the two cannot disagree about
 * where the document lives.
 */
export const WELCOME_DOC_REL = '欢迎使用/欢迎使用.md'

export const BUNDLED_SKILLS: BundledSkill[] = [
  {
    id: 'image-to-doc-folder',
    title: '把图片写进文档文件夹',
    summary:
      '让 AI 生成或收到的图片落到文档旁边的 _img 目录，用相对路径引用 —— 不用 base64，不用图床。',
    body: IMAGE_TO_DOC_FOLDER
  },
  {
    id: 'export-for-sharing',
    title: '导出可分享的单文件文档',
    summary:
      '剥离本地图片与本地路径，保留远程链接、内嵌图片和代码块原文，逐行处理并在写出前预览。',
    body: EXPORT_FOR_SHARING
  }
]
