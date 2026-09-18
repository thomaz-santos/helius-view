import { useEffect, useRef } from 'react'
import ForceGraph, { type LinkObject, type NodeObject } from 'force-graph'
import type { GraphLink } from '../../src/shared/graph'
import { dependentCounts, type RenderGraph, type RenderNode } from './lib/collapse'
import { topFolder } from './lib/tree'

type FGNode = NodeObject & RenderNode
type FGLink = LinkObject<FGNode> & GraphLink

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function baseNodeColor(n: FGNode, folderColors: Map<string, string>): string {
  if (n.kind === 'package') return '#22c55e'
  if (String(n.id).startsWith('unresolved:')) return '#f59e0b'
  return folderColors.get(topFolder(n.file ?? String(n.id))) ?? '#38bdf8'
}

function baseLinkColor(l: FGLink): string {
  if (l.circular) return '#ef4444'
  if (l.unresolved) return '#f59e0b'
  if (l.kind === 'import-type') return '#8b5cf6'
  if (l.kind === 'import-dynamic') return '#0ea5e9'
  return '#64748b'
}

function linkDash(l: FGLink): number[] | null {
  if (l.kind === 'import-type') return [2, 2]
  if (l.kind === 'import-dynamic') return [5, 3]
  if (l.unresolved) return [1, 3]
  return null
}

function endpointId(end: string | number | FGNode | undefined): string {
  if (end == null) return ''
  return typeof end === 'object' ? String(end.id) : String(end)
}

export interface GraphViewProps {
  graph: RenderGraph
  folderColors: Map<string, string>
  selected?: string
  highlightSet: Set<string> | null
  onSelect: (id: string | undefined) => void
}

export function GraphView({ graph, folderColors, selected, highlightSet, onSelect }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraph<FGNode, FGLink> | null>(null)

  // accessors do force-graph são registrados uma vez só (efeito de montagem); lêem estado
  // "vivo" via refs em vez de fechar sobre props que ficariam obsoletas
  const folderColorsRef = useRef(folderColors)
  const selectedRef = useRef(selected)
  const highlightRef = useRef(highlightSet)
  const countsRef = useRef<Map<string, number>>(new Map())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fg = new ForceGraph<FGNode, FGLink>(el)
      .nodeId('id')
      .linkSource('source')
      .linkTarget('target')
      .nodeLabel((n) => (n.collapsedCount ? `${n.name}/ (${n.collapsedCount} arquivos)` : `${n.kind}: ${n.id}`))
      .nodeColor((n) => {
        const base = baseNodeColor(n, folderColorsRef.current)
        if (String(n.id) === selectedRef.current) return base
        const hs = highlightRef.current
        return hs && !hs.has(String(n.id)) ? withAlpha(base, 0.15) : base
      })
      .nodeVal((n) => 1 + Math.sqrt(countsRef.current.get(String(n.id)) ?? 0))
      .linkColor((l) => {
        const base = baseLinkColor(l)
        const hs = highlightRef.current
        if (hs && !(hs.has(endpointId(l.source)) && hs.has(endpointId(l.target)))) return withAlpha(base, 0.08)
        return base
      })
      .linkWidth((l) => (l.circular ? 2.5 : 1))
      .linkLineDash(linkDash)
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
      .onNodeClick((n) => onSelectRef.current(String(n.id)))
      .onBackgroundClick(() => onSelectRef.current(undefined))
      .width(el.clientWidth)
      .height(el.clientHeight)
    fgRef.current = fg

    const onResize = () => fg.width(el.clientWidth).height(el.clientHeight)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      fg._destructor()
      fgRef.current = null
    }
  }, [])

  // ponytail: graphData() substitui os objetos de nó, então o d3-force reseta a posição
  // (perde x/y anteriores) a cada mudança de filtro/seleção/destaque, não só de dados.
  // Upgrade: mesclar por id preservando x/y dos nós que continuam existindo.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    folderColorsRef.current = folderColors
    selectedRef.current = selected
    highlightRef.current = highlightSet
    countsRef.current = dependentCounts(graph.links)
    const nodes = graph.nodes.map((n) => ({ ...n }))
    const links = graph.links.map((l) => ({ ...l }))
    fg.graphData({ nodes, links })
  }, [graph, selected, highlightSet, folderColors])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !selected) return
    // dá um tempo pro layout assentar depois do reset acima antes de centralizar
    const t = setTimeout(() => {
      const node = fg.graphData().nodes.find((n) => String(n.id) === selected)
      if (node && typeof node.x === 'number' && typeof node.y === 'number') {
        fg.centerAt(node.x, node.y, 600)
        fg.zoom(3, 600)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [selected])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
