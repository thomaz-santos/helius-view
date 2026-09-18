import fs from 'node:fs'
import path from 'node:path'
import { ts } from 'ts-morph'
import { classMemberInfo, symbolId, topLevelDeclInfo } from './symbolId'
import type { SearchResult } from '../shared/symbol'

// passada só sintática (sem type checker) pros símbolos de topo de um arquivo — usada só
// pro índice de busca em segundo plano (decisão 12). A resolução semântica de verdade
// (chamadas, aliases, implementações) é o /api/symbols, sob demanda.
export function indexFile(root: string, absPath: string): SearchResult[] {
  let source: string
  try {
    source = fs.readFileSync(absPath, 'utf8')
  } catch {
    return []
  }
  const relId = path.relative(root, absPath).split(path.sep).join('/')
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true)
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1

  const seen = new Map<string, SearchResult>()
  const add = (name: string, kind: SearchResult['kind'], line: number, hasBody: boolean) => {
    if (seen.has(name) && !hasBody) return // sobrecarga sem corpo: não sobrescreve a implementação já vista
    seen.set(name, { id: symbolId(relId, name), kind, name, file: relId, line })
  }

  ts.forEachChild(sf, (node) => {
    const info = topLevelDeclInfo(node)
    if (info) add(info.name, info.kind, lineOf(node.getStart(sf)), info.hasBody)
    if (ts.isClassDeclaration(node)) {
      const className = node.name?.text ?? 'default'
      for (const member of node.members) {
        const m = classMemberInfo(member)
        if (m) add(`${className}.${m.name}`, m.kind, lineOf(member.getStart(sf)), m.hasBody)
      }
    }
  })

  return [...seen.values()]
}

// menor trecho de `text` que contém `query` como subsequência (greedy), ou undefined
function subsequenceSpan(query: string, text: string): number | undefined {
  let qi = 0
  let first = -1
  let last = -1
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      if (first === -1) first = ti
      last = ti
      qi++
    }
  }
  return qi < query.length ? undefined : last - first + 1
}

export function searchIndex(entries: SearchResult[], query: string, limit = 50): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries.slice(0, limit)

  const scored: { entry: SearchResult; span: number }[] = []
  for (const entry of entries) {
    const haystack = `${entry.name} ${entry.file}`.toLowerCase()
    const span = subsequenceSpan(q, haystack)
    if (span !== undefined) scored.push({ entry, span })
  }
  scored.sort((a, b) => a.span - b.span || a.entry.name.length - b.entry.name.length)
  return scored.slice(0, limit).map((s) => s.entry)
}
