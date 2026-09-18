import type { GraphLink } from '../../../src/shared/graph'
import type { RenderGraph, RenderNode } from './collapse'
import { topFolder } from './tree'

// tudo aqui é puro e não depende do renderizador (force-graph 2D ou 3d-force-graph): cores,
// accessors e detecção de duplo clique são os mesmos nos dois modos (etapa 6, decisão 4 —
// mesmo grafo, mesmas regras de cor/tamanho, só a forma de desenhar muda).

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function baseNodeColor(n: Pick<RenderNode, 'id' | 'kind' | 'file'>, folderColors: Map<string, string>): string {
  if (n.kind === 'package') return '#22c55e'
  if (String(n.id).startsWith('unresolved:')) return '#f59e0b'
  return folderColors.get(topFolder(n.file ?? String(n.id))) ?? '#38bdf8'
}

export function baseLinkColor(l: GraphLink): string {
  if (l.circular) return '#ef4444'
  if (l.unresolved) return '#f59e0b'
  if (l.kind === 'import-type' || l.kind === 'reference') return '#8b5cf6'
  if (l.kind === 'import-dynamic') return '#0ea5e9'
  if (l.kind === 'call-possible') return '#eab308'
  if (l.kind === 'extends' || l.kind === 'implements') return '#14b8a6'
  return '#64748b' // import, call
}

// tracejado 2D (força-bruta pro force-graph, que suporta linha tracejada nativa). No 3D não
// existe equivalente nativo: os mesmos kinds usam partículas/opacidade reduzida em vez disso
// (isLogicalLink), mas a CLASSIFICAÇÃO de quais arestas são "lógicas" é a mesma nos dois modos.
export function linkDash(l: GraphLink): number[] | null {
  if (l.kind === 'import-type' || l.kind === 'reference') return [2, 2]
  if (l.kind === 'import-dynamic') return [5, 3]
  if (l.kind === 'call-possible') return [4, 4] // decisão 11: interface/abstrato -> possíveis implementações
  if (l.unresolved) return [1, 3]
  return null
}

export function isLogicalLink(l: GraphLink): boolean {
  return linkDash(l) !== null
}

export function endpointId(end: string | number | { id?: string | number } | undefined): string {
  if (end == null) return ''
  return typeof end === 'object' ? String(end.id) : String(end)
}

export const DBL_CLICK_MS = 400

// duplo clique detectado manualmente (nem force-graph nem 3d-force-graph expõem
// onNodeDblClick): true na segunda vez que o mesmo id é clicado dentro da janela.
export function makeDblClickTracker() {
  let last: { id: string; time: number } | null = null
  return (id: string): boolean => {
    const now = Date.now()
    const isDbl = last !== null && last.id === id && now - last.time < DBL_CLICK_MS
    last = isDbl ? null : { id, time: now }
    return isDbl
  }
}

export interface Positioned {
  x?: number
  y?: number
  z?: number
  vx?: number
  vy?: number
  vz?: number
}

// dados só são reaplicados quando o grafo muda (2D e 3D); nós que continuam existindo
// herdam posição e velocidade por id (2D: x/y/vx/vy; 3D: também z/vz), pro layout não
// embaralhar a cada atualização.
export function inheritPositions(prevById: Map<string, Positioned>, nodes: RenderNode[]): (RenderNode & Positioned)[] {
  return nodes.map((n) => {
    const p = prevById.get(n.id)
    return p ? { ...n, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz } : { ...n }
  })
}

export interface GraphViewProps {
  graph: RenderGraph
  folderColors: Map<string, string>
  selected?: string
  highlightSet: Set<string> | null
  onSelect: (id: string | undefined) => void
  onExpandFile?: (fileId: string) => void
  // etapa 6: caminho entre dois nós — arestas destacadas (chave via linkKey) e clique com
  // shift num nó pra escolher o destino sem abrir a busca
  pathLinkKeys?: Set<string> | null
  onShiftSelect?: (id: string) => void
}
