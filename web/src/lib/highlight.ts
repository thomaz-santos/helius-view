// Realce de sintaxe simples pro bloco de processamento (decisão f), sem biblioteca: um
// tokenizador por regex, não um parser de verdade — cobre comentário/string/número/
// palavra-chave/pontuação, o suficiente pra colorir código TS/JS legível.
export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'punct' | 'plain'

export interface Token {
  text: string
  type: TokenType
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'extends', 'implements',
  'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'default', 'break', 'continue', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw',
  'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'public',
  'private', 'protected', 'readonly', 'static', 'abstract', 'get', 'set', 'as', 'satisfies',
  'enum', 'namespace', 'declare', 'is', 'keyof', 'infer', 'null', 'undefined', 'true', 'false',
])

const TOKEN_RE =
  /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|(`(?:\\.|[^`\\])*`)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\s\w]+)/g

export function tokenize(code: string): Token[] {
  const tokens: Token[] = []
  for (const m of code.matchAll(TOKEN_RE)) {
    const [text, comment1, comment2, template, dq, sq, num, word] = m
    if (comment1 || comment2) tokens.push({ text, type: 'comment' })
    else if (template || dq || sq) tokens.push({ text, type: 'string' })
    else if (num) tokens.push({ text, type: 'number' })
    else if (word) tokens.push({ text, type: KEYWORDS.has(word) ? 'keyword' : 'plain' })
    else tokens.push({ text, type: text.trim() === '' ? 'plain' : 'punct' })
  }
  return tokens
}
