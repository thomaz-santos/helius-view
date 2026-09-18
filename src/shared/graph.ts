// Formato do grafo (PLAN.md). Nível 1: nós `file`/`package`, arestas de import.
export type NodeKind = 'file' | 'package' | 'function' | 'class' | 'method' | 'variable' | 'type'
export type EdgeKind =
  | 'import'
  | 'import-type'
  | 'import-dynamic'
  | 'call'
  | 'call-possible'
  | 'reference'
  | 'extends'
  | 'implements'

export interface GraphNode {
  id: string
  kind: NodeKind
  name: string
  file?: string
  line?: number
  exported?: boolean
}

export interface GraphLink {
  source: string
  target: string
  kind: EdgeKind
  // aresta para especificador que não resolveu a um arquivo ou pacote
  unresolved?: boolean
  // aresta participa de um ciclo de imports entre arquivos
  circular?: boolean
}

export interface Graph {
  nodes: GraphNode[]
  links: GraphLink[]
}
