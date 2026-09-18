import path from 'node:path'

// Toda rota que recebe um caminho relativo (file=, ou a parte antes de '#' num id de
// símbolo) precisa validar que ele resolve pra dentro da raiz analisada E pertence ao
// conjunto de arquivos descobertos — nunca confia no caminho cru vindo da requisição.
export function resolveDiscoveredFile(root: string, relPath: string, discovered: ReadonlySet<string>): string | undefined {
  // a API só aceita ids relativos (os mesmos que /api/graph devolve); um caminho absoluto
  // vindo do cliente é sempre recusado, mesmo que por acaso resolvesse pra dentro da raiz
  if (!relPath || relPath.includes('\0') || path.isAbsolute(relPath)) return undefined
  const abs = path.resolve(root, relPath)
  const rel = path.relative(root, abs).split(path.sep).join('/')
  if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined
  if (!discovered.has(rel)) return undefined
  return abs
}

// id de símbolo é "caminho#nomeQualificado" (decisão 10); valida só a parte do caminho.
export function fileFromSymbolId(symbolId: string): string {
  const hash = symbolId.indexOf('#')
  return hash === -1 ? symbolId : symbolId.slice(0, hash)
}
