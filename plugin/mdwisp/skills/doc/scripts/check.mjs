#!/usr/bin/env node
/**
 * Validate an MDWisp document folder.
 *
 *   node check.mjs <document folder | .md file> [--no-images]
 *
 * Exits 1 when the folder would not survive being copied to another machine.
 * No dependencies: the plugin must run wherever the assistant does.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const noImages = args.includes('--no-images')
const input = args.find((a) => !a.startsWith('--'))
if (!input) {
  console.error('用法：node check.mjs <文档文件夹或 md 文件> [--no-images]')
  process.exit(2)
}

const errors = []
const warnings = []

function findDoc(target) {
  const abs = resolve(target)
  if (!existsSync(abs)) return null
  if (statSync(abs).isFile()) return abs
  const named = join(abs, `${basename(abs)}.md`)
  if (existsSync(named)) return named
  const docs = readdirSync(abs).filter((name) => /\.(md|markdown)$/i.test(name))
  return docs.length === 1 ? join(abs, docs[0]) : null
}

const docPath = findDoc(input)
if (!docPath) {
  console.error(`✗ 找不到文档：${resolve(input)}（文件夹里应有一个与它同名的 .md）`)
  process.exit(1)
}

const docDir = dirname(docPath)
const stem = basename(docPath).replace(/\.(md|markdown)$/i, '')
const assetName = `${stem}_img`
const assetDir = join(docDir, assetName)

if (basename(docDir) !== stem) {
  errors.push(`md 不在同名文件夹里：应为 ${stem}/${stem}.md，实际在 ${basename(docDir)}/ 下`)
}

/** Image targets outside fenced and inline code, with their line numbers. */
function imageLinks(text) {
  const found = []
  let fence = null
  text.split(/\r?\n/).forEach((line, index) => {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null
      return
    }
    if (mark) {
      fence = mark
      return
    }
    const pattern = /(`+).*?\1|!\[([^\]]*)\]\((<[^>]*>|[^)\s]*)(?:\s+"[^"]*")?\)|<img[^>]+src=["']([^"']+)["']/gi
    for (const m of line.matchAll(pattern)) {
      const target = m[3] ?? m[4]
      if (target === undefined) continue
      found.push({ line: index + 1, target: target.replace(/^<|>$/g, ''), alt: m[2] })
    }
  })
  return found
}

const links = imageLinks(readFileSync(docPath, 'utf8'))
const referenced = new Set()

for (const { line, target, alt } of links) {
  const at = `第 ${line} 行 ${target.length > 60 ? `${target.slice(0, 60)}…` : target}`
  if (noImages) {
    errors.push(`${at}：无图模式下不应出现图片`)
    continue
  }
  if (target.startsWith('data:')) {
    errors.push(`第 ${line} 行：base64 内嵌图片，应存成文件放进 ${assetName}/`)
    continue
  }
  if (/^(https?:)?\/\//i.test(target)) {
    warnings.push(`${at}：远程图片，链接失效后会变成破图`)
    continue
  }
  if (/^[a-z]:[\\/]/i.test(target) || target.startsWith('/') || target.startsWith('\\\\') || /^file:/i.test(target)) {
    errors.push(`${at}：绝对路径，换台机器就打不开`)
    continue
  }
  if (target.includes('\\')) errors.push(`${at}：路径分隔符应为 /`)
  if (!target.startsWith(`./${assetName}/`)) {
    errors.push(`${at}：图片应放在 ./${assetName}/ 里`)
    continue
  }
  if (/[\s()]/.test(target)) errors.push(`${at}：文件名不应含空格或括号`)
  if (/%[0-9a-f]{2}/i.test(target)) errors.push(`${at}：路径不应做 URL 编码`)
  if (alt !== undefined && !alt.trim()) warnings.push(`${at}：缺少 alt 文字`)

  const file = join(docDir, target)
  if (!existsSync(file)) {
    errors.push(`${at}：文件不存在`)
    continue
  }
  referenced.add(resolve(file).toLowerCase())

  if (extname(file).toLowerCase() === '.svg') {
    const svg = readFileSync(file, 'utf8')
    if (!/<svg[\s>]/.test(svg)) errors.push(`${at}：不是有效的 SVG`)
    if (!/viewBox=/.test(svg)) errors.push(`${at}：SVG 缺少 viewBox`)
    if (/(href|src)=["'](https?:)?\/\//i.test(svg.replace(/xmlns(:\w+)?=["'][^"']*["']/g, '')) || /@import/.test(svg)) {
      errors.push(`${at}：SVG 引用了外部资源，离线时打不开`)
    }
  }
}

if (existsSync(assetDir)) {
  if (noImages) errors.push(`无图模式下不应有 ${assetName}/ 目录`)
  for (const name of readdirSync(assetDir)) {
    if (!referenced.has(resolve(assetDir, name).toLowerCase())) {
      errors.push(`${assetName}/${name}：没有被文档引用，删掉或在文档里用上`)
    }
  }
}

for (const message of warnings) console.log(`! ${message}`)
for (const message of errors) console.log(`✗ ${message}`)
const images = referenced.size
if (errors.length) {
  console.log(`\n未通过：${errors.length} 个错误${warnings.length ? `，${warnings.length} 个提醒` : ''} — ${docPath}`)
  process.exit(1)
}
console.log(`✓ 通过：${stem}/，${images} 张图片${warnings.length ? `，${warnings.length} 个提醒` : ''}`)
