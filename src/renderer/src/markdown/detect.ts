/**
 * Local code-language detection. No network, no model, no dependencies.
 *
 * Three tiers, highest confidence first:
 *   1. fingerprint  — a token that can only belong to one language (score 100)
 *   2. weighted     — additive evidence, must beat the runner-up by a margin
 *   3. give up      — return `null` rather than guess; a wrong highlight is
 *                     worse than no highlight, and the UI lets the user pick.
 */

export interface Detection {
  lang: string | null
  /** 0–100. Only meaningful when `lang` is non-null. */
  confidence: number
  /** Runner-up and its score, for the "why this language" affordance. */
  runnerUp: { lang: string; score: number } | null
}

interface Rule {
  lang: string
  strong: RegExp[]
  weak: RegExp[]
}

const RULES: Rule[] = [
  {
    lang: 'python',
    strong: [/^\s*def\s+\w+\s*\(.*\)\s*:/m, /^\s*class\s+\w+(\(.*\))?\s*:/m, /__name__\s*==\s*['"]__main__['"]/],
    weak: [/^\s*(import|from)\s+\w+/m, /\belif\b/, /\brange\(/, /\bself\./, /^\s{4}\S/m]
  },
  {
    lang: 'typescript',
    strong: [
      /\binterface\s+\w+\s*\{/,
      /:\s*(string|number|boolean|void|unknown|any)\b/,
      /\btype\s+\w+\s*=/,
      /\benum\s+\w+\s*\{/,
      /\bas\s+const\b/,
      /<\w+(\s*,\s*\w+)*>\s*\(/
    ],
    weak: [/\bconst\s+\w+\s*=/, /=>\s*\{/, /\?\?/, /\?\./, /:\s*\w+\[\]/, /\bimplements\b/]
  },
  {
    lang: 'javascript',
    strong: [/^\s*(const|let|var)\s+\w+\s*=/m, /=>\s*\{/, /function\s*\w*\s*\(/],
    weak: [/\brequire\(/, /module\.exports/, /console\.log\(/, /`[^`]*\$\{/]
  },
  {
    lang: 'jsx',
    strong: [/return\s*\(\s*</, /<[A-Z]\w*[\s/>]/],
    weak: [/className=/, /\bprops\b/, /\buseState\(/]
  },
  {
    lang: 'java',
    strong: [/public\s+(static\s+)?(class|void|final)\s/, /import\s+java\./, /System\.out\./],
    weak: [/@Override/, /private\s+\w+\s+\w+\s*[=;]/]
  },
  {
    lang: 'csharp',
    strong: [/using\s+System(\.\w+)*\s*;/, /\bnamespace\s+[\w.]+\s*\{/, /Console\.WriteLine/],
    weak: [/public\s+void\s/, /\[[A-Z]\w*(\(.*\))?\]/, /\bvar\s+\w+\s*=\s*new\b/]
  },
  {
    lang: 'cpp',
    strong: [/#include\s*<[\w./]+>/, /std::\w+/, /\btemplate\s*</, /\bnullptr\b/],
    weak: [/^\s*int\s+main\s*\(/m, /\bprintf\(/, /\bmalloc\(/, /->\w+\(/]
  },
  {
    lang: 'c',
    strong: [/#include\s*<[\w./]+\.h>/],
    weak: [/\bprintf\(/, /\bstruct\s+\w+\s*\{/, /\btypedef\b/]
  },
  {
    lang: 'php',
    strong: [/<\?php/, /\$\w+\s*=\s*[^=]/, /function\s+\w+\s*\(\s*\$/, /->\w+\(/],
    weak: [/\becho\s/, /\buse\s+\w+\\/, /\$this->/]
  },
  {
    lang: 'ruby',
    strong: [/^\s*def\s+\w+[!?]?/m, /\bdo\s*\|/, /^\s*end\s*$/m, /\b@\w+\s*=/],
    weak: [/\bputs\s/, /require\s+['"]/, /:\w+\s*=>/]
  },
  {
    lang: 'go',
    strong: [/^\s*package\s+\w+/m, /^\s*func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/m, /\berr\s*!=\s*nil\b/],
    weak: [/:=/, /\bdefer\s/, /\bchan\s/, /\bgo\s+func\b/]
  },
  {
    lang: 'rust',
    strong: [/\bfn\s+\w+\s*\(/, /\bimpl\s+\w+/, /\blet\s+mut\s+/, /\b(&str|String|Vec<|Option<|Result<)/],
    weak: [/println!\(/, /\buse\s+std::/, /\bmatch\s+\w+\s*\{/, /\.unwrap\(\)/]
  },
  {
    lang: 'kotlin',
    strong: [/^\s*fun\s+\w+/m, /\b(val|var)\s+\w+\s*[:=]/, /\bwhen\s*\(/],
    weak: [/\bdata\s+class\b/, /!!/, /\bcompanion\s+object\b/]
  },
  {
    lang: 'swift',
    strong: [/\bfunc\s+\w+\s*\(/, /\bguard\s+let\b/, /\bif\s+let\b/, /@IBOutlet|@IBAction/],
    weak: [/\blet\s+\w+\s*[:=]/, /\bself\./, /->\s*Void/]
  },
  {
    lang: 'sql',
    strong: [
      /\bSELECT\b[\s\S]*\bFROM\b/i,
      /\bINSERT\s+INTO\b/i,
      /\bCREATE\s+(TABLE|INDEX|VIEW)\b/i,
      /\bUPDATE\b[\s\S]*\bSET\b/i
    ],
    weak: [/\bWHERE\b/, /\bJOIN\b/, /\bGROUP\s+BY\b/i, /\bNULL\b/]
  },
  {
    lang: 'bash',
    strong: [/^#!\s*\/(usr\/)?bin\/(env\s+)?(bash|sh|zsh)/m, /^\s*(if|while)\s+\[\[?/m, /^\s*\w+\(\)\s*\{/m],
    weak: [/\becho\s/, /\bexport\s+\w+=/, /\bfi\b/, /\$\(/, /^\s*\w+=\S+/m]
  },
  {
    lang: 'powershell',
    strong: [/\bGet-\w+/, /\$env:\w+/, /-ErrorAction\b/, /\|?\s*Where-Object\b/],
    weak: [/\bWrite-Host\b/, /\bparam\s*\(/, /\$\w+\s*=\s*@\{/]
  },
  {
    lang: 'css',
    strong: [/^[.#]?[\w-]+[^{}]*\{[^}]*:[^}]*;/m, /@media[^{]*\{/, /^:root\s*\{/m],
    weak: [/\bdisplay:\s*(flex|grid|block|none)/, /\bmargin:/, /\bcolor:\s*#/]
  },
  {
    lang: 'scss',
    strong: [/\$[\w-]+\s*:\s*[^;]+;/, /@mixin\s+\w+/, /@include\s+\w+/],
    weak: [/&:(hover|focus|active)/, /@extend\s/]
  },
  {
    lang: 'html',
    strong: [/<!DOCTYPE\s+html>/i, /<html[\s>]/i, /<\/\w+>\s*$/m],
    weak: [/<div\b/, /<span\b/, /class="/, /href="/]
  },
  {
    lang: 'xml',
    strong: [/<\?xml\s+version=/, /xmlns[:=]/],
    weak: [/<\/\w+>/, /^<\w+>/m]
  },
  {
    lang: 'yaml',
    strong: [/^---\s*$/m, /^\s*[\w-]+:\s*$/m],
    weak: [/^\s*-\s+\w+/m, /^\s*[\w-]+:\s+\S+/m, /^\s*#/m]
  },
  {
    lang: 'toml',
    strong: [/^\[\[?[\w.-]+\]\]?\s*$/m],
    weak: [/^\s*[\w-]+\s*=\s*["'\d[{]/m]
  },
  {
    lang: 'json',
    strong: [/^\s*\{\s*"/, /^\s*\[\s*\{?\s*"/],
    weak: [/"[^"]+"\s*:\s*/, /^\s*\}/m, /^\s*\]/m]
  },
  {
    lang: 'markdown',
    strong: [/^#{1,6}\s+\S/m, /^\s*[-*]\s+\S/m],
    weak: [/\*\*[^*]+\*\*/, /\[[^\]]+\]\([^)]+\)/, /^>/m]
  },
  {
    lang: 'lua',
    strong: [/^\s*local\s+\w+/m, /\bfunction\s+\w*\s*\(/, /\bnil\b/],
    weak: [/\bthen\b/, /^\s*end\s*$/m, /\brequire\s*\(/]
  },
  {
    lang: 'r',
    strong: [/<-/, /\blibrary\(/, /\bdata\.frame\(/],
    weak: [/\bc\(/, /\bfunction\s*\(/, /^\s*#/m]
  },
  {
    lang: 'dart',
    strong: [/\bvoid\s+main\s*\(\s*\)/, /@override/, /\bWidget\s+build\(/],
    weak: [/\bfinal\s+\w+\s*=/, /=>\s*\w+,?$/m, /\bimport\s+'package:/]
  },
  {
    lang: 'haskell',
    strong: [/^\s*\w+\s*::\s*\w+/m, /\bwhere\s*$/m, /<-/],
    weak: [/\bdata\s+\w+\s*=/, /\bimport\s+Data\./, /\bderiving\b/]
  },
  {
    lang: 'graphql',
    strong: [/\b(query|mutation|subscription)\s+\w*\s*\{/, /\btype\s+\w+\s*\{[^}]*\}/],
    weak: [/\bfragment\s+\w+\s+on\b/, /^\s*\w+\s*:\s*\[?\w+!?\]?/m]
  },
  {
    lang: 'elixir',
    strong: [/\bdefmodule\s+\w+/, /\bdefp?\s+\w+.*\bdo\b/, /\|>/],
    weak: [/@moduledoc/, /^\s*end\s*$/m, /\bIO\.(puts|inspect)/]
  },
  {
    lang: 'dockerfile',
    strong: [/^FROM\s+\S+/m],
    weak: [/^RUN\s+/m, /^COPY\s+/m, /^WORKDIR\s+/m, /^EXPOSE\s+/m, /^ENTRYPOINT\s+/m]
  },
  {
    lang: 'ini',
    strong: [/^\[[\w.\s-]+\]\s*$/m],
    weak: [/^\s*[\w.-]+\s*=\s*\S+/m, /^\s*;/m]
  },
  {
    lang: 'nginx',
    strong: [/\bserver\s*\{[^}]*listen\s+\d+/s, /\blocation\s+[\^~=\/]/],
    weak: [/\bproxy_pass\b/, /\bupstream\s+\w+/, /\broot\s+\//]
  }
]

const FINGERPRINTS: { re: RegExp; lang: string }[] = [
  { re: /^\s*#!\s*.*\b(bash|sh|zsh)\b/m, lang: 'bash' },
  { re: /^\s*#!\s*.*\bpython[23]?\b/m, lang: 'python' },
  { re: /^\s*#!\s*.*\bnode\b/m, lang: 'javascript' },
  { re: /^\s*#!\s*.*\bruby\b/m, lang: 'ruby' },
  { re: /<!DOCTYPE\s+html>/i, lang: 'html' },
  { re: /<\?php/, lang: 'php' },
  { re: /<\?xml\s+version=/, lang: 'xml' },
  { re: /^\s*package\s+main\b[\s\S]*\bfunc\s+main\s*\(/m, lang: 'go' },
  { re: /\bfn\s+main\s*\(\s*\)/, lang: 'rust' },
  { re: /\bdefmodule\s+\w+\s+do\b/, lang: 'elixir' },
  { re: /^\s*FROM\s+\S+[\s\S]*^\s*RUN\s+/m, lang: 'dockerfile' }
]

const MARGIN = 20

/** Cheap structural check: does this parse as JSON? */
function isJson(code: string): boolean {
  const trimmed = code.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export function detectLanguage(code: string): Detection {
  const sample = code.length > 8000 ? code.slice(0, 8000) : code
  const lines = sample.split('\n')
  const lineCount = Math.max(lines.length, 1)

  if (isJson(sample)) {
    return { lang: 'json', confidence: 98, runnerUp: null }
  }

  for (const fp of FINGERPRINTS) {
    if (fp.re.test(sample)) {
      return { lang: fp.lang, confidence: 96, runnerUp: null }
    }
  }

  const scores = new Map<string, number>()

  for (const rule of RULES) {
    let score = 0
    for (const re of rule.strong) {
      if (re.test(sample)) score += 22
    }
    for (const re of rule.weak) {
      if (re.test(sample)) score += 6
    }
    if (score === 0) continue

    // Ratio of matching lines to total: a rule that fires everywhere is noise.
    const density = lines.filter((l) => rule.weak.some((re) => re.test(l))).length / lineCount
    score += Math.round(density * 14)

    // TypeScript must outrank the JavaScript rule it structurally contains.
    if (rule.lang === 'typescript' && scores.has('javascript')) {
      score += 10
    }
    scores.set(rule.lang, score)
  }

  // JSON is also valid-looking YAML in some shapes; the parse above wins, so
  // only reach here when it failed — drop the JSON rule's tail evidence.
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return { lang: null, confidence: 0, runnerUp: null }

  const [topLang, topScore] = ranked[0]
  const second = ranked[1] ?? null
  const gap = second ? topScore - second[1] : topScore

  if (gap < MARGIN || topScore < 14) {
    return {
      lang: null,
      confidence: 0,
      runnerUp: second ? { lang: second[0], score: second[1] } : null
    }
  }

  const confidence = Math.max(35, Math.min(94, Math.round((topScore / (topScore + 30)) * 100)))
  return {
    lang: topLang,
    confidence,
    runnerUp: second ? { lang: second[0], score: second[1] } : null
  }
}
