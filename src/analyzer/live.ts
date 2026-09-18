import fs from 'node:fs'
import path from 'node:path'
import { nearestTsconfig, type TsConfigInfo } from './discover'
import { importLinksForFile, markCircular, toId } from './graph'
import type { Graph, GraphLink, GraphNode } from '../shared/graph'
import type { FileChange } from '../shared/protocol'

// tsconfig.json ou .gitignore mudou: o escopo descoberto e/ou as compilerOptions podem ter
// mudado de um jeito que uma atualização incremental não capturaria direito (arquivo que
// passou a ser incluído/excluído por um path novo, alias novo, etc) — reanálise completa é
// o caminho simples e correto aqui.
export function needsFullReanalysis(changes: FileChange[]): boolean {
  return changes.some((c) => {
    const base = c.file.slice(c.file.lastIndexOf('/') + 1)
    return base === 'tsconfig.json' || base === '.gitignore'
  })
}

// estado do grafo de nível 1 mantido em memória entre atualizações ao vivo, pra permitir
// mudar só o que mudou em vez de rediscobrir tudo do zero a cada evento do watcher.
export interface LiveGraphState {
  nodes: Map<string, GraphNode>
  links: GraphLink[]
  fileEdges: { from: string; to: string }[]
  discovered: Set<string>
}

export function stateFromGraph(graph: Graph, files: string[], root: string): LiveGraphState {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const fileEdges: { from: string; to: string }[] = []
  for (const l of graph.links) {
    if (!l.unresolved && nodes.get(l.source)?.kind === 'file' && nodes.get(l.target)?.kind === 'file') {
      fileEdges.push({ from: l.source, to: l.target })
    }
  }
  return { nodes, links: [...graph.links], fileEdges, discovered: new Set(files.map((abs) => toId(root, abs))) }
}

// cópia rasa: markCircular muda `circular` nos objetos de aresta em memória (mesma
// referência); sem copiar aqui, um `graphOf` tirado ANTES de uma atualização (pra diffGraph
// comparar contra o de depois) seria mutado retroativamente e o patch perderia a mudança.
export function graphOf(state: LiveGraphState): Graph {
  return { nodes: [...state.nodes.values()], links: state.links.map((l) => ({ ...l })) }
}

function removeLinksFrom(state: LiveGraphState, fileId: string): void {
  state.links = state.links.filter((l) => l.source !== fileId)
  state.fileEdges = state.fileEdges.filter((e) => e.from !== fileId)
}

// aplica uma lista de arquivos alterados (add/change/unlink, já filtrados pelo mesmo escopo
// da descoberta) num LiveGraphState, atualizando nós/arestas/descobertos in place. Devolve os
// ids relativos dos arquivos cujos imports realmente foram recalculados (não inclui arquivos
// fora do tsconfig, que nunca entram no grafo).
export function applyFileChanges(root: string, state: LiveGraphState, tsconfigs: TsConfigInfo[], changes: FileChange[]): string[] {
  const touched: string[] = []

  for (const change of changes) {
    const abs = path.resolve(root, change.file)
    const id = toId(root, abs)

    if (change.type === 'unlink' || !fs.existsSync(abs)) {
      if (!state.nodes.has(id) && !state.discovered.has(id)) continue
      state.nodes.delete(id)
      state.discovered.delete(id)
      removeLinksFrom(state, id)
      touched.push(id)
      continue
    }

    // arquivo novo entra só se o tsconfig mais próximo o incluir (mesma regra da descoberta)
    const lookup = nearestTsconfig(abs, tsconfigs)
    if (lookup.status === 'excluded') {
      if (state.nodes.has(id) || state.discovered.has(id)) {
        state.nodes.delete(id)
        state.discovered.delete(id)
        removeLinksFrom(state, id)
        touched.push(id)
      }
      continue
    }

    state.discovered.add(id)
    if (!state.nodes.has(id)) state.nodes.set(id, { id, kind: 'file', name: path.basename(abs), file: id })

    removeLinksFrom(state, id)
    const newLinks = importLinksForFile(root, abs, tsconfigs, state.nodes)
    state.links.push(...newLinks)
    for (const l of newLinks) {
      if (!l.unresolved && state.nodes.get(l.target)?.kind === 'file') state.fileEdges.push({ from: id, to: l.target })
    }
    touched.push(id)
  }

  for (const l of state.links) delete l.circular
  markCircular(state.fileEdges, state.links)

  // pacotes/specifiers não-resolvidos só existem enquanto alguma aresta aponta pra eles;
  // sem isso, remover o import que os criava deixaria um nó órfão no grafo pra sempre.
  const stillReferenced = new Set(state.links.map((l) => l.target))
  for (const [id, n] of state.nodes) {
    if ((n.kind === 'package' || id.startsWith('unresolved:')) && !stillReferenced.has(id)) state.nodes.delete(id)
  }

  return touched
}
