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
    // Declarations alone are shared with TypeScript and every C-like language,
    // so they are corroboration. JS is identified by its module and runtime
    // surface, which TypeScript keeps but which a typed snippet rarely shows.
    strong: [/\brequire\s*\(/, /module\.exports/, /\bexports\.\w+\s*=/, /=>\s*\{[^}]*\}/, /console\.log\(/],
    weak: [/\b(const|let|var)\s+\w+\s*=/, /`[^`]*\$\{/, /\bfunction\s+\w+\s*\(/]
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
      // `[\s\S]` spans lines, so these need the multiline flag to behave.
      /^\s*SELECT\b[\s\S]*?\bFROM\b/im,
      /\bINSERT\s+INTO\b/i,
      /\bCREATE\s+(TABLE|INDEX|VIEW)\b/i,
      /^\s*UPDATE\b[\s\S]*?\bSET\b/im
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
    // `function name(` is not characteristic of anything — every C-family
    // language has it. Lua is identified by `local`, `nil`, `then`/`end`.
    strong: [/^\s*local\s+\w+\s*=/m, /\bnil\b/, /\belseif\b/, /\bthen\s*$/m],
    weak: [/\bfunction\s+[\w.:]*\s*\(/, /^\s*end\s*$/m, /\brequire\s*\(/, /\.\./]
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
    // A bare `FROM` line is not enough — SQL has `FROM` too, and a Markdown
    // document can contain either. Dockerfiles are identified by a run of
    // instructions in upper case at line start.
    strong: [/^FROM\s+\S+[\s\S]*^RUN\s+/m, /^FROM\s+\S+[\s\S]*^(COPY|ADD|WORKDIR|ENTRYPOINT|CMD)\s+/m],
    weak: [/^ARG\s+/m, /^ENV\s+/m, /^EXPOSE\s+/m, /^VOLUME\s+/m, /^LABEL\s+/m]
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

/** The leader must beat the runner-up by this much or we decline to guess. */
const MARGIN = 18
/** Below this absolute score there is simply not enough evidence. */
const MIN_SCORE = 22

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
    let strong = 0
    let weak = 0
    for (const re of rule.strong) {
      if (re.test(sample)) strong++
    }
    for (const re of rule.weak) {
      if (re.test(sample)) weak++
    }
    if (strong === 0 && weak === 0) continue

    // A language must show at least one marker that is *characteristic* of it.
    // Weak signals are corroboration, not identification — treating them as
    // candidates lets a broad rule like Lua's `function name(` compete with
    // JavaScript and collapse the margin that keeps the result honest.
    if (strong === 0) continue

    // Strong evidence is worth far more than weak, and both scale with how
    // many *distinct* markers fired rather than a flat per-rule bonus.
    let score = strong * 16 + weak * 5

    // Coverage: the share of lines the rule recognises at all. A rule that
    // fires on one line of forty is a coincidence, not a match.
    const covered = lines.filter(
      (l) => rule.strong.some((re) => re.test(l)) || rule.weak.some((re) => re.test(l))
    ).length
    const density = covered / lineCount
    score += Math.round(density * 26)

    // A language needs somewhere for its evidence to land. Without this, a
    // single keyword in a one-line snippet scores as highly as a real file.
    if (strong === 0) score = Math.round(score * 0.55)

    scores.set(rule.lang, score)
  }

  // TypeScript is a syntactic superset of JavaScript, so every TS block also
  // scores for JS. The annotation evidence has to outweigh that inheritance.
  const js = scores.get('javascript')
  if (js !== undefined && js > 0) scores.set('javascript', Math.round(js * 0.72))

  // JSON is also valid-looking YAML in some shapes; the parse above wins, so
  // only reach here when it failed — drop the JSON rule's tail evidence.
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return { lang: null, confidence: 0, runnerUp: null }

  const [topLang, topScore] = ranked[0]
  const second = ranked[1] ?? null
  const gap = second ? topScore - second[1] : topScore

  if (gap < MARGIN || topScore < MIN_SCORE) {
    return {
      lang: null,
      confidence: 0,
      runnerUp: second ? { lang: second[0], score: second[1] } : null
    }
  }

  // Confidence blends absolute evidence with the margin over the runner-up:
  // a high score with a close second is not a confident answer.
  const strength = Math.min(1, topScore / 90)
  const separation = Math.min(1, gap / 60)
  const confidence = Math.round(38 + 54 * (strength * 0.62 + separation * 0.38))

  return {
    lang: topLang,
    confidence: Math.max(38, Math.min(95, confidence)),
    runnerUp: second ? { lang: second[0], score: second[1] } : null
  }
}
