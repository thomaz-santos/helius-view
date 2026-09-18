import { linkKey } from '../../../src/shared/graph'
import type { GraphLink } from '../../../src/shared/graph'

export interface PathResult {
  // ids dos nós no caminho, da origem ao destino (inclusive)
  nodes: string[]
  // arestas usadas, na ordem — chave estável via linkKey (source+target+kind)
  links: { source: string; target: string; kind: string }[]
}

// menor caminho (BFS, grafo sem peso) entre dois nós já carregados. Direcionada por padrão
// (segue o sentido das arestas); `undirected` também anda contra o sentido. null quando não
// há caminho.
export function shortestPath(links: GraphLink[], from: string, to: string, undirected = false): PathResult | null {
  if (from === to) return { nodes: [from], links: [] }

  const adj = new Map<string, { to: string; link: GraphLink }[]>()
  const add = (a: string, b: string, link: GraphLink) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push({ to: b, link })
  }
  for (const l of links) {
    add(l.source, l.target, l)
    if (undirected) add(l.target, l.source, l)
  }

  const prev = new Map<string, { from: string; link: GraphLink }>()
  const visited = new Set<string>([from])
  const queue = [from]
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]!
    if (cur === to) break
    for (const { to: next, link } of adj.get(cur) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      prev.set(next, { from: cur, link })
      queue.push(next)
    }
  }
  if (!visited.has(to)) return null

  const nodes: string[] = [to]
  const pathLinks: GraphLink[] = []
  for (let cur = to; cur !== from; ) {
    const step = prev.get(cur)!
    pathLinks.push(step.link)
    cur = step.from
    nodes.push(cur)
  }
  nodes.reverse()
  pathLinks.reverse()

  return { nodes, links: pathLinks.map((l) => ({ source: l.source, target: l.target, kind: l.kind })) }
}

export function pathLinkKeySet(result: PathResult | null): Set<string> {
  return new Set((result?.links ?? []).map(linkKey))
}
