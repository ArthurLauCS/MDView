import { describe, expect, it } from 'vitest'
import { detectLanguage } from './detect'

/**
 * Detection is judged on two things: it must identify code that is clearly
 * one language, and it must refuse to guess when the evidence is thin.
 * A wrong highlight is worse than none, so the second half matters as much.
 */
describe('detectLanguage', () => {
  describe('identifies unambiguous code', () => {
    it('typeScript from an interface and type annotations', () => {
      const code = `interface DocumentMeta {
  id: string
  path: string
  assetDir: string
}

export function metaFor(absPath: string): DocumentMeta {
  const stem = basename(absPath).replace(/\\.md$/i, '')
  return { id: docIdFor(absPath), path: absPath }
}`
      const r = detectLanguage(code)
      expect(r.lang).toBe('typescript')
      expect(r.confidence).toBeGreaterThan(50)
    })

    it('python from def/class and __main__', () => {
      const code = `import os
import sys

def load(path):
    with open(path) as f:
        return f.read()

class Loader:
    def __init__(self, root):
        self.root = root

if __name__ == '__main__':
    print(load(sys.argv[1]))`
      expect(detectLanguage(code).lang).toBe('python')
    })

    it('bash from a shebang', () => {
      const code = `#!/usr/bin/env bash
set -euo pipefail
for f in *.md; do
  echo "处理 $f"
done`
      expect(detectLanguage(code).lang).toBe('bash')
    })

    it('sql from a select with a from clause', () => {
      const code = `SELECT id, name, created_at
FROM users
WHERE active = 1
ORDER BY created_at DESC`
      expect(detectLanguage(code).lang).toBe('sql')
    })

    it('json from a parse', () => {
      const code = `{ "name": "mdview", "version": "0.1.0", "private": true }`
      expect(detectLanguage(code).lang).toBe('json')
    })

    it('rust from fn and impl', () => {
      const code = `fn main() {
    let mut total = 0;
    for item in items.iter() {
        total += item.value();
    }
    println!("{}", total);
}`
      expect(detectLanguage(code).lang).toBe('rust')
    })

    it('go from package main and func main', () => {
      const code = `package main

import "fmt"

func main() {
    msg := "hello"
    if msg != "" {
        fmt.Println(msg)
    }
}`
      expect(detectLanguage(code).lang).toBe('go')
    })

    it('html from a doctype', () => {
      const code = `<!DOCTYPE html>
<html lang="zh-CN">
  <head><title>页面</title></head>
  <body><div class="app">内容</div></body>
</html>`
      expect(detectLanguage(code).lang).toBe('html')
    })
  })

  describe('refuses to guess on thin evidence', () => {
    it('returns null for plain prose', () => {
      const r = detectLanguage('这段文字只是一段普通的中文说明，没有任何代码结构。')
      expect(r.lang).toBeNull()
    })

    it('returns null for a single ambiguous token', () => {
      const r = detectLanguage('name = value')
      expect(r.lang).toBeNull()
    })

    it('returns null for an empty block', () => {
      const r = detectLanguage('')
      expect(r.lang).toBeNull()
      expect(r.confidence).toBe(0)
    })

    it('does not confuse a bare shell command with a language', () => {
      const r = detectLanguage('npm install')
      expect(r.lang).toBeNull()
    })
  })

  describe('disambiguates related languages', () => {
    it('prefers typescript over javascript when annotations are present', () => {
      const code = `const users: string[] = []
function add(name: string): void {
  users.push(name)
}`
      expect(detectLanguage(code).lang).toBe('typescript')
    })

    it('still picks javascript when there are no annotations', () => {
      const code = `const users = []
function add(name) {
  users.push(name)
}
module.exports = { add }`
      const r = detectLanguage(code)
      expect(['javascript', 'typescript']).toContain(r.lang)
      expect(r.lang).toBe('javascript')
    })
  })

  describe('shape of the result', () => {
    it('always reports a finite confidence in range', () => {
      const r = detectLanguage('SELECT * FROM t WHERE id = 1')
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(100)
      expect(Number.isFinite(r.confidence)).toBe(true)
    })

    it('never returns a lang without confidence', () => {
      const r = detectLanguage('#!/bin/sh\necho hi')
      expect(r.lang).not.toBeNull()
      expect(r.confidence).toBeGreaterThan(0)
    })
  })
})
