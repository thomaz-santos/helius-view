import fs from 'node:fs'
import path from 'node:path'
import type { ts } from 'ts-morph'
import { discoverFiles, nearestTsconfig, type TsConfigInfo } from './discover'
import { extractImports, resolveImport, packageNameFromSpecifier, DEFAULT_OPTIONS, type RawImport } from './imports'
import type { Graph, GraphNode, GraphLink } from '../shared/graph'
import type { ProgressEvent } from '../shared/protocol'

const toId = (root: string, abs: string) => path.relative(root, abs).split(path.sep).join('/')

export interface AnalyzeResult {
  graph: Graph
  files: string[]
  tsconfigs: TsConfigInfo[]
}

export function analyze(root: string, exclude: string[], emit: (e: ProgressEvent) => void): AnalyzeResult {
  const { files, tsconfigs, warning } = discoverFiles(root, exclude)
  emit({ event: 'progress', phase: 'discover', count: files.length, warning })

  const nodes = new Map<string, GraphNode>()
  const links: GraphLink[] = []
  // arestas entre arquivos (sem externos/não-resolvidos), usadas só pra achar ciclos
  const fileEdges: { from: string; to: string }[] = []

  for (const abs of files) {
    const id = toId(root, abs)
    nodes.set(id, { id, kind: 'file', name: path.basename(abs), file: id })
  }

  let done = 0
  for (const abs of files) {
    const fromId = toId(root, abs)
    const lookup = nearestTsconfig(abs, tsconfigs)
    const options = lookup.status === 'included' ? lookup.config.options : DEFAULT_OPTIONS

    let source: string
    try {
      source = fs.readFileSync(abs, 'utf8')
    } catch {
      done++
      continue
    }

    for (const imp of extractImports(source)) {
      const resolved = resolveImport(imp.specifier, abs, options)
      const link = toLink(root, fromId, imp, resolved, options, nodes)
      links.push(link)
      if (!link.unresolved && nodes.get(link.target)?.kind === 'file') {
        fileEdges.push({ from: fromId, to: link.target })
      }
    }

    done++
    if (done % 25 === 0 || done === files.length) {
      emit({ event: 'progress', phase: 'analyze', done, total: files.length })
    }
  }

  markCircular(fileEdges, links)

  const graph: Graph = { nodes: [...nodes.values()], links }
  emit({ event: 'progress', phase: 'done', nodes: graph.nodes.length, links: graph.links.length })
  return { graph, files, tsconfigs }
}

function toLink(
  root: string,
  fromId: string,
  imp: RawImport,
  resolved: ts.ResolvedModuleWithFailedLookupLocations,
  options: ts.CompilerOptions,
  nodes: Map<string, GraphNode>,
): GraphLink {
  const mod = resolved.resolvedModule
  if (mod) {
    if (mod.isExternalLibraryImport) {
      return { source: fromId, target: packageNode(nodes, mod.packageId?.name ?? packageNameFromSpecifier(imp.specifier)), kind: imp.kind }
    }
    const targetId = toId(root, mod.resolvedFileName)
    if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId, kind: 'file', name: path.basename(targetId), file: targetId })
    return { source: fromId, target: targetId, kind: imp.kind }
  }

  const bare = !imp.specifier.startsWith('.') && !path.isAbsolute(imp.specifier)
  // specifier que bate com um alias do tsconfig (ex.: "@/x") mas não resolveu: é um alias
  // quebrado, não um pacote externo — vira unresolved em vez de esconder o problema num pkg:
  if (bare && !matchesPathAlias(imp.specifier, options)) {
    return { source: fromId, target: packageNode(nodes, packageNameFromSpecifier(imp.specifier)), kind: imp.kind }
  }

  const targetId = `unresolved:${fromId}:${imp.specifier}`
  if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId, kind: 'file', name: imp.specifier })
  return { source: fromId, target: targetId, kind: imp.kind, unresolved: true }
}

function matchesPathAlias(specifier: string, options: ts.CompilerOptions): boolean {
  if (!options.paths) return false
  for (const key of Object.keys(options.paths)) {
    const prefix = key.slice(0, key.indexOf('*'))
    if (key.includes('*') ? specifier.startsWith(prefix) : specifier === key) return true
  }
  return false
}

function packageNode(nodes: Map<string, GraphNode>, name: string): string {
  const id = `pkg:${name}`
  if (!nodes.has(id)) nodes.set(id, { id, kind: 'package', name })
  return id
}

// Tarjan: acha componentes fortemente conexos no grafo de imports entre arquivos e
// marca `circular` nas arestas cujos dois lados caem no mesmo componente (tamanho > 1).
function markCircular(fileEdges: { from: string; to: string }[], links: GraphLink[]) {
  const adj = new Map<string, string[]>()
  for (const e of fileEdges) {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(e.to)
  }

  let index = 0
  const indices = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const sccOf = new Map<string, number>()
  const sccSize = new Map<number, number>()
  let sccCount = 0

  // ponytail: strongconnect é recursivo (uma chamada por nó no grafo de arquivos); uma
  // cadeia de imports muito profunda pode estourar a pilha. Upgrade: Tarjan iterativo
  // (pilha explícita) se isso aparecer em repositórios reais.
  function strongconnect(v: string) {
    indices.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, indices.get(w)!))
      }
    }

    if (low.get(v) === indices.get(v)) {
      const id = sccCount++
      let size = 0
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        sccOf.set(w, id)
        size++
      } while (w !== v)
      sccSize.set(id, size)
    }
  }

  const allNodes = new Set<string>()
  for (const e of fileEdges) {
    allNodes.add(e.from)
    allNodes.add(e.to)
  }
  for (const v of allNodes) if (!indices.has(v)) strongconnect(v)

  for (const link of links) {
    const s = sccOf.get(link.source)
    const t = sccOf.get(link.target)
    if (s !== undefined && s === t && (sccSize.get(s) ?? 0) > 1) link.circular = true
  }
}
