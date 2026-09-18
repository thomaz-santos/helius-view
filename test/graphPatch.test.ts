import { describe, expect, it } from 'vitest'
import { diffGraph } from '../src/analyzer/graphPatch'
import type { Graph } from '../src/shared/graph'

const g = (nodes: Graph['nodes'], links: Graph['links'] = []): Graph => ({ nodes, links })

describe('diffGraph', () => {
  it('grafo igual: patch vazio', () => {
    const graph = g(
      [{ id: 'a.ts', kind: 'file', name: 'a.ts', file: 'a.ts' }],
      [{ source: 'a.ts', target: 'b.ts', kind: 'import' }],
    )
    const patch = diffGraph(graph, graph)
    expect(patch.nodes).toEqual({ added: [], removed: [], changed: [] })
    expect(patch.links).toEqual({ added: [], removed: [], changed: [] })
  })

  it('nó novo -> added; nó sumido -> removed', () => {
    const prev = g([{ id: 'a.ts', kind: 'file', name: 'a.ts', file: 'a.ts' }])
    const next = g([{ id: 'b.ts', kind: 'file', name: 'b.ts', file: 'b.ts' }])
    const patch = diffGraph(prev, next)
    expect(patch.nodes.added.map((n) => n.id)).toEqual(['b.ts'])
    expect(patch.nodes.removed).toEqual(['a.ts'])
  })

  it('campo do nó muda (mesmo id) -> changed, não added+removed', () => {
    const prev = g([{ id: 'a.ts#foo', kind: 'function', name: 'foo', file: 'a.ts', line: 3, exported: false }])
    const next = g([{ id: 'a.ts#foo', kind: 'function', name: 'foo', file: 'a.ts', line: 5, exported: true }])
    const patch = diffGraph(prev, next)
    expect(patch.nodes.added).toEqual([])
    expect(patch.nodes.removed).toEqual([])
    expect(patch.nodes.changed).toEqual(next.nodes)
  })

  it('aresta identificada por source+target+kind: unresolved/circular mudando -> changed', () => {
    const nodes = [
      { id: 'a.ts', kind: 'file' as const, name: 'a.ts', file: 'a.ts' },
      { id: 'b.ts', kind: 'file' as const, name: 'b.ts', file: 'b.ts' },
    ]
    const prev = g(nodes, [{ source: 'a.ts', target: 'b.ts', kind: 'import' }])
    const next = g(nodes, [{ source: 'a.ts', target: 'b.ts', kind: 'import', circular: true }])
    const patch = diffGraph(prev, next)
    expect(patch.links.added).toEqual([])
    expect(patch.links.removed).toEqual([])
    expect(patch.links.changed).toEqual(next.links)
  })

  it('aresta some -> removed identificada por source+target+kind (sem depender de referência)', () => {
    const nodes = [
      { id: 'a.ts', kind: 'file' as const, name: 'a.ts', file: 'a.ts' },
      { id: 'b.ts', kind: 'file' as const, name: 'b.ts', file: 'b.ts' },
    ]
    const prev = g(nodes, [{ source: 'a.ts', target: 'b.ts', kind: 'import' }])
    const next = g(nodes, [])
    const patch = diffGraph(prev, next)
    expect(patch.links.removed).toEqual([{ source: 'a.ts', target: 'b.ts', kind: 'import' }])
  })

  it('mesma aresta com kind diferente conta como removed+added, não changed', () => {
    const nodes = [
      { id: 'a.ts', kind: 'file' as const, name: 'a.ts', file: 'a.ts' },
      { id: 'b.ts', kind: 'file' as const, name: 'b.ts', file: 'b.ts' },
    ]
    const prev = g(nodes, [{ source: 'a.ts', target: 'b.ts', kind: 'import' }])
    const next = g(nodes, [{ source: 'a.ts', target: 'b.ts', kind: 'import-type' }])
    const patch = diffGraph(prev, next)
    expect(patch.links.removed).toEqual([{ source: 'a.ts', target: 'b.ts', kind: 'import' }])
    expect(patch.links.added).toEqual(next.links)
    expect(patch.links.changed).toEqual([])
  })
})
