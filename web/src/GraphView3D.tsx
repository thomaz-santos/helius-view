import { useEffect, useRef } from 'react'
import ForceGraph3DFactory, { type NodeObject, type LinkObject, type ForceGraph3DInstance } from '3d-force-graph'
import { dependentCounts, type RenderNode } from './lib/collapse'
import {
  baseLinkColor,
  baseNodeColor,
  endpointId,
  inheritPositions,
  isLogicalLink,
  makeDblClickTracker,
  withAlpha,
  type GraphViewProps,
} from './lib/graphStyle'
import { linkKey } from '../../src/shared/graph'
import type { GraphLink } from '../../src/shared/graph'

type FGNode = NodeObject & RenderNode
type FGLink = LinkObject<FGNode> & GraphLink

// o .d.ts do pacote exporta ForceGraph3D como uma const (não uma classe genérica de
// verdade como o force-graph 2D), então `new ForceGraph3D<N,L>(el)` não type-checa — o
// construtor é retipado uma vez aqui em vez de espalhar casts pelo componente inteiro.
type ForceGraph3DCtor<N extends NodeObject, L extends LinkObject<N>> = new (element: HTMLElement) => ForceGraph3DInstance<N, L>
const ForceGraph3D = ForceGraph3DFactory as unknown as ForceGraph3DCtor<FGNode, FGLink>

// mesmo grafo, mesmas regras de cor/tamanho do 2D (GraphView.tsx) — reaproveitadas de
// lib/graphStyle.ts. Sem tracejado nativo no three.js: arestas "lógicas" (isLogicalLink,
// mesma classificação do tracejado 2D) ganham opacidade reduzida + partícula em vez de dash.
export function GraphView3D({ graph, folderColors, selected, highlightSet, onSelect, onExpandFile, pathLinkKeys, onShiftSelect }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraph3DInstance<FGNode, FGLink> | null>(null)

  const folderColorsRef = useRef(folderColors)
  const selectedRef = useRef(selected)
  const highlightRef = useRef(highlightSet)
  const pathLinkKeysRef = useRef(pathLinkKeys)
  const countsRef = useRef<Map<string, number>>(new Map())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onExpandFileRef = useRef(onExpandFile)
  onExpandFileRef.current = onExpandFile
  const onShiftSelectRef = useRef(onShiftSelect)
  onShiftSelectRef.current = onShiftSelect
  const dblClickRef = useRef(makeDblClickTracker())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fg = new ForceGraph3D(el)
      .nodeId('id')
      .linkSource('source')
      .linkTarget('target')
      .backgroundColor('#0b1220')
      .nodeLabel((n) => (n.collapsedCount ? `${n.name}/ (${n.collapsedCount} arquivos)` : `${n.kind}: ${n.id}`))
      .nodeColor((n) => {
        const base = baseNodeColor(n, folderColorsRef.current)
        if (String(n.id) === selectedRef.current) return base
        const hs = highlightRef.current
        return hs && !hs.has(String(n.id)) ? withAlpha(base, 0.15) : base
      })
      .nodeVal((n) => 1 + Math.sqrt(countsRef.current.get(String(n.id)) ?? 0))
      .linkColor((l) => {
        const onPath = pathLinkKeysRef.current?.has(linkKey({ source: endpointId(l.source), target: endpointId(l.target), kind: l.kind }))
        if (onPath) return '#22d3ee'
        const base = baseLinkColor(l)
        if (pathLinkKeysRef.current && pathLinkKeysRef.current.size > 0) return withAlpha(base, 0.06)
        const hs = highlightRef.current
        if (hs && !(hs.has(endpointId(l.source)) && hs.has(endpointId(l.target)))) return withAlpha(base, 0.06)
        return isLogicalLink(l) ? withAlpha(base, 0.55) : base
      })
      .linkWidth((l) => {
        const onPath = pathLinkKeysRef.current?.has(linkKey({ source: endpointId(l.source), target: endpointId(l.target), kind: l.kind }))
        return onPath ? 2.5 : l.circular ? 1.6 : 0.6
      })
      // equivalente ao tracejado do 2D: aresta "lógica" ganha uma partícula lenta em vez de dash
      .linkDirectionalParticles((l) => (isLogicalLink(l) ? 1 : 0))
      .linkDirectionalParticleWidth(1.6)
      .linkDirectionalParticleSpeed(0.004)
      .linkDirectionalArrowLength(3)
      .linkDirectionalArrowRelPos(1)
      .onNodeClick((n, event) => {
        const id = String(n.id)
        if (event.shiftKey) {
          onShiftSelectRef.current?.(id)
          return
        }
        if (dblClickRef.current(id)) {
          if (n.kind === 'file' && n.file) onExpandFileRef.current?.(n.file)
          return
        }
        onSelectRef.current(id)
      })
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

  // dados: só quando o grafo muda; nós que continuam existindo herdam x/y/z/vx/vy/vz por id
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    countsRef.current = dependentCounts(graph.links)
    const prevById = new Map(fg.graphData().nodes.map((n) => [String(n.id), n]))
    const nodes = inheritPositions(prevById, graph.nodes) as FGNode[]
    const links = graph.links.map((l) => ({ ...l })) as FGLink[]
    fg.graphData({ nodes, links })
  }, [graph])

  // seleção, destaque e caminho são só pintura
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    folderColorsRef.current = folderColors
    selectedRef.current = selected
    highlightRef.current = highlightSet
    pathLinkKeysRef.current = pathLinkKeys
    fg.nodeColor(fg.nodeColor()).linkColor(fg.linkColor()).linkWidth(fg.linkWidth())
  }, [selected, highlightSet, pathLinkKeys, folderColors])

  // centraliza a câmera no nó selecionado (equivalente 3D do centerAt+zoom do 2D)
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !selected) return
    const t = setTimeout(() => {
      const node = fg.graphData().nodes.find((n) => String(n.id) === selected)
      if (!node || typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') return
      const distance = 120
      const hyp = Math.hypot(node.x, node.y, node.z)
      const distRatio = hyp === 0 ? 1 : 1 + distance / hyp
      fg.cameraPosition({ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, { x: node.x, y: node.y, z: node.z }, 800)
    }, 250)
    return () => clearTimeout(t)
  }, [selected])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
