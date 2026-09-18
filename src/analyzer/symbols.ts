import path from 'node:path'
import { Node, type SourceFile, type Symbol as TsMorphSymbol } from 'ts-morph'
import { ensureFile } from './project'
import type { TsConfigInfo } from './discover'
import type { Graph, GraphNode, GraphLink, NodeKind } from '../shared/graph'
import { classMemberInfo, symbolId, topLevelDeclInfo, type SymbolKind } from './symbolId'

export const toId = (root: string, abs: string) => path.relative(root, abs).split(path.sep).join('/')

export interface SymbolEntry {
  node: Node
  qualifiedName: string
  kind: SymbolKind
}

// cache por arquivo dos símbolos de topo já extraídos, reaproveitado tanto pra listar o
// arquivo pedido quanto pra achar o "dono" de uma declaração de outro arquivo (chamada
// cross-file, extends/implements) sem re-varrer o arquivo inteiro de novo.
const topLevelCache = new Map<string, SymbolEntry[]>()

export function topLevelSymbolsOf(sf: SourceFile): SymbolEntry[] {
  const key = sf.getFilePath()
  const cached = topLevelCache.get(key)
  if (cached) return cached
  const entries = collectTopLevelSymbols(sf)
  topLevelCache.set(key, entries)
  return entries
}

// atualização ao vivo (etapa 5): arquivo mudou no disco, os símbolos de topo extraídos antes
// não valem mais (linhas deslocadas, símbolo novo/removido).
export function invalidateTopLevelCache(absPath: string): void {
  topLevelCache.delete(absPath.replace(/\\/g, '/'))
}

function collectTopLevelSymbols(sf: SourceFile): SymbolEntry[] {
  const seen = new Map<string, SymbolEntry & { hasBody: boolean }>()
  const add = (node: Node, qualifiedName: string, kind: SymbolKind, hasBody: boolean) => {
    const existing = seen.get(qualifiedName)
    if (existing && !hasBody) return
    seen.set(qualifiedName, { node, qualifiedName, kind, hasBody })
  }

  for (const stmt of sf.getStatements()) {
    const info = topLevelDeclInfo(stmt.compilerNode)
    if (info) {
      const target = Node.isVariableStatement(stmt) ? (stmt.getDeclarations()[0] ?? stmt) : stmt
      add(target, info.name, info.kind, info.hasBody)
    }
    if (Node.isClassDeclaration(stmt)) {
      const className = stmt.getName() ?? 'default'
      for (const member of stmt.getMembers()) {
        const m = classMemberInfo(member.compilerNode)
        if (m) add(member, `${className}.${m.name}`, m.kind, m.hasBody)
      }
    }
  }

  return [...seen.values()].map(({ node, qualifiedName, kind }) => ({ node, qualifiedName, kind }))
}

// pro ALVO de uma chamada/referência/extends/implements: só conta se a própria declaração
// for, ela mesma, um símbolo de topo — não sobe por ancestrais. Um parâmetro ou variável
// local resolvido não vira alvo válido (cai em unresolved), só funções/classes/métodos/
// variáveis/tipos de topo de verdade.
export function exactSymbolOf(node: Node): SymbolEntry | undefined {
  return topLevelSymbolsOf(node.getSourceFile()).find((e) => e.node === node)
}

// pro DONO de um call site: sobe pelos ancestrais até achar o símbolo de topo que contém
// esse nó — callback inline não vira nó, a chamada dentro dele é atribuída à função
// nomeada que o contém.
export function findOwningSymbol(node: Node): SymbolEntry | undefined {
  const entries = topLevelSymbolsOf(node.getSourceFile())
  let cur: Node | undefined = node
  while (cur) {
    const hit = entries.find((e) => e.node === cur)
    if (hit) return hit
    cur = cur.getParent()
  }
  return undefined
}

function resolveAliasedSymbol(sym: TsMorphSymbol | undefined): TsMorphSymbol | undefined {
  return sym?.getAliasedSymbol() ?? sym
}

function isExported(node: Node): boolean | undefined {
  if (Node.isVariableDeclaration(node)) return node.getVariableStatement()?.isExported()
  if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) {
    return node.isExported()
  }
  return undefined
}

function getCallableBody(node: Node): Node | undefined {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node) || Node.isGetAccessorDeclaration(node) || Node.isSetAccessorDeclaration(node)) {
    return node.getBodyOrThrow()
  }
  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer()
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init
  }
  return undefined
}

function isCalleeOf(node: Node): boolean {
  const parent = node.getParent()
  if (!parent) return false
  if (Node.isCallExpression(parent) && parent.getExpression() === node) return true
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node) return isCalleeOf(parent)
  return false
}

// getImplementations() só acha implementações entre arquivos já carregados no Project do
// ts-morph; como o carregamento é sob demanda (decisão 13), um arquivo só entra quando
// algo o importa direta ou transitivamente. Pra call-possible funcionar de verdade,
// carrega todos os arquivos descobertos uma vez (ensureFile já deduplica) — só paga esse
// custo quando uma chamada realmente aponta pra uma interface/método abstrato.
let allFilesEnsured = false
function ensureAllProjectFiles(root: string, discovered: ReadonlySet<string>, tsconfigs: TsConfigInfo[]) {
  if (allFilesEnsured) return
  for (const rel of discovered) ensureFile(path.resolve(root, rel), tsconfigs)
  allFilesEnsured = true
}

// atualização ao vivo (etapa 5): arquivo novo pode ser uma implementação de interface que
// ainda não existia quando ensureAllProjectFiles rodou pela última vez; sem isso, um
// call-possible novo só apareceria depois de reiniciar o servidor.
export function resetAllFilesEnsured(): void {
  allFilesEnsured = false
}

// arquivo mudou/foi apagado no disco: os símbolos de topo cacheados dele não valem mais.
export function clearAllSymbolCaches(): void {
  topLevelCache.clear()
  allFilesEnsured = false
}

export type CallBucket = 'project' | 'external' | 'unresolved'
export type CallEdgeKind = 'call' | 'call-possible' | 'reference'

export interface FoundCall {
  bucket: CallBucket
  edgeKind: CallEdgeKind
  targetId?: string
  label: string
  line: number
  start: number
  end: number
}

// varre o corpo de um símbolo chamável procurando chamadas e referências soltas a outros
// símbolos, seguindo aliases até a declaração original (barrels). Usada tanto pelo grafo
// de /api/symbols (só o que é 'project') quanto pelo painel de /api/symbol (os três baldes).
export function analyzeCalls(body: Node, root: string, discovered: ReadonlySet<string>, tsconfigs: TsConfigInfo[]): FoundCall[] {
  const found: FoundCall[] = []

  const targetOf = (declFile: string, decl: Node): { targetId: string } | undefined => {
    const owner = exactSymbolOf(decl)
    return owner ? { targetId: symbolId(declFile, owner.qualifiedName) } : undefined
  }

  body.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression()
      const line = node.getStartLineNumber()
      const label = callee.getText()
      const start = node.getStart() - body.getStart()
      const end = node.getEnd() - body.getStart()
      const resolvable = Node.isPropertyAccessExpression(callee) ? callee.getNameNode() : Node.isIdentifier(callee) ? callee : undefined

      if (!resolvable) {
        found.push({ bucket: 'unresolved', edgeKind: 'call', label, line, start, end })
        return
      }
      const sym = resolveAliasedSymbol(resolvable.getSymbol())
      const decls = sym?.getDeclarations() ?? []
      if (decls.length === 0) {
        found.push({ bucket: 'unresolved', edgeKind: 'call', label, line, start, end })
        return
      }

      const decl = decls[0]!
      // só interessa se for interface/abstrato do PRÓPRIO projeto — Map.get, Array.forEach
      // etc. também resolvem pra uma MethodSignature (na lib do TS), mas são externos: sem
      // esse filtro primeiro, getImplementations() varreria o projeto inteiro à toa (lento
      // e semanticamente errado, já que não são símbolos nossos).
      const declFile = toId(root, decl.getSourceFile().getFilePath())
      if (!discovered.has(declFile)) {
        found.push({ bucket: 'external', edgeKind: 'call', label, line, start, end })
        return
      }

      const isAbstractTarget = Node.isMethodSignature(decl) || (Node.isMethodDeclaration(decl) && decl.isAbstract())
      if (isAbstractTarget) {
        ensureAllProjectFiles(root, discovered, tsconfigs)
        const impls = resolvable.getImplementations()
        if (impls.length === 0) {
          found.push({ bucket: 'unresolved', edgeKind: 'call', label, line, start, end })
        }
        for (const impl of impls) {
          // getImplementations() devolve o identificador do nome; o nó guardado nas
          // entradas de topo é a declaração (MethodDeclaration) em si, um nível acima
          const implDecl = impl.getNode().getParent() ?? impl.getNode()
          const implFile = toId(root, implDecl.getSourceFile().getFilePath())
          const target = targetOf(implFile, implDecl)
          if (target) {
            found.push({ bucket: 'project', edgeKind: 'call-possible', targetId: target.targetId, label, line, start, end })
          }
        }
        return
      }

      const target = targetOf(declFile, decl)
      if (!target) {
        found.push({ bucket: 'unresolved', edgeKind: 'call', label, line, start, end })
        return
      }
      found.push({ bucket: 'project', edgeKind: 'call', targetId: target.targetId, label, line, start, end })
      return
    }

    // "função como argumento: reference" (decisão 11) é sobre identificadores em posição
    // de VALOR; um tipo usado numa anotação ("x: GraphNode", "Map<string, GraphNode>")
    // não é uma referência de valor e não deve virar aresta.
    if (Node.isIdentifier(node) && !isCalleeOf(node) && !Node.isTypeReference(node.getParent())) {
      const sym = resolveAliasedSymbol(node.getSymbol())
      const decl = sym?.getDeclarations()[0]
      if (!decl) return
      const declFile = toId(root, decl.getSourceFile().getFilePath())
      if (!discovered.has(declFile)) return
      const target = targetOf(declFile, decl)
      if (!target) return
      const line = node.getStartLineNumber()
      const start = node.getStart() - body.getStart()
      const end = node.getEnd() - body.getStart()
      found.push({ bucket: 'project', edgeKind: 'reference', targetId: target.targetId, label: node.getText(), line, start, end })
    }
  })

  return found
}

function linkToDeclaration(
  expr: Node,
  sourceId: string,
  kind: 'extends' | 'implements',
  root: string,
  links: GraphLink[],
) {
  const sym = resolveAliasedSymbol(expr.getSymbol())
  for (const decl of sym?.getDeclarations() ?? []) {
    const declFile = toId(root, decl.getSourceFile().getFilePath())
    const owner = exactSymbolOf(decl)
    if (owner) links.push({ source: sourceId, target: symbolId(declFile, owner.qualifiedName), kind })
  }
}

// GET /api/symbols?file=: símbolos de topo do arquivo como nós, mais as arestas
// call/call-possible/reference/extends/implements que apontam pra outros símbolos do
// projeto (chamadas externas/não-resolvidas só aparecem no /api/symbol de cada símbolo).
export function buildSymbolGraph(absFile: string, root: string, tsconfigs: TsConfigInfo[], discovered: ReadonlySet<string>): Graph {
  const sf = ensureFile(absFile, tsconfigs)
  if (!sf) return { nodes: [], links: [] }
  const relFile = toId(root, absFile)

  const entries = topLevelSymbolsOf(sf)
  const nodes: GraphNode[] = entries.map((e) => ({
    id: symbolId(relFile, e.qualifiedName),
    kind: e.kind as NodeKind,
    name: e.qualifiedName,
    file: relFile,
    line: e.node.getStartLineNumber(),
    exported: isExported(e.node),
  }))

  const links: GraphLink[] = []
  for (const entry of entries) {
    const sourceId = symbolId(relFile, entry.qualifiedName)

    if (entry.kind === 'class' && Node.isClassDeclaration(entry.node)) {
      const ext = entry.node.getExtends()
      if (ext) linkToDeclaration(ext.getExpression(), sourceId, 'extends', root, links)
      for (const impl of entry.node.getImplements()) linkToDeclaration(impl.getExpression(), sourceId, 'implements', root, links)
    }

    const body = getCallableBody(entry.node)
    if (body) {
      for (const call of analyzeCalls(body, root, discovered, tsconfigs)) {
        if (call.bucket === 'project' && call.targetId) links.push({ source: sourceId, target: call.targetId, kind: call.edgeKind })
      }
    }
  }

  return { nodes, links }
}
