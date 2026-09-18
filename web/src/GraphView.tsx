import { useEffect, useRef } from 'react'
import ForceGraph, { type LinkObject, type NodeObject } from 'force-graph'
import type { Graph, GraphNode, GraphLink } from '../../src/shared/graph'

type FGNode = NodeObject & GraphNode
type FGLink = LinkObject<FGNode> & GraphLink

function nodeColor(n: FGNode): string {
  if (n.id?.toString().startsWith('unresolved:')) return '#f59e0b'
  return n.kind === 'package' ? '#22c55e' : '#38bdf8'
}

function linkColor(l: FGLink): string {
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

export function GraphView({ graph, showExternal }: { graph: Graph; showExternal: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraph<FGNode, FGLink> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fg = new ForceGraph<FGNode, FGLink>(el)
      .nodeId('id')
      .linkSource('source')
      .linkTarget('target')
      .nodeLabel((n) => `${n.kind}: ${n.id}`)
      .nodeColor(nodeColor)
      .nodeVal((n) => (n.kind === 'package' ? 4 : 2))
      .linkColor(linkColor)
      .linkWidth((l) => (l.circular ? 2.5 : 1))
      .linkLineDash(linkDash)
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
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

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const nodes = (showExternal ? graph.nodes : graph.nodes.filter((n) => n.kind !== 'package')).map((n) => ({ ...n }))
    const visibleIds = new Set(nodes.map((n) => n.id))
    const links = graph.links.filter((l) => visibleIds.has(l.source) && visibleIds.has(l.target)).map((l) => ({ ...l }))
    fg.graphData({ nodes, links })
  }, [graph, showExternal])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
