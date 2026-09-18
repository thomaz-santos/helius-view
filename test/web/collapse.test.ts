import { describe, expect, it } from 'vitest'
import { collapseGraph, dependentCounts, effectiveNodeId, filterGraph } from '../../web/src/lib/collapse'
import type { Graph } from '../../src/shared/graph'

const graph: Graph = {
  nodes: [
    { id: 'src/a.ts', kind: 'file', name: 'a.ts', file: 'src/a.ts' },
    { id: 'src/inner/b.ts', kind: 'file', name: 'b.ts', file: 'src/inner/b.ts' },
    { id: 'src/inner/c.ts', kind: 'file', name: 'c.ts', file: 'src/inner/c.ts' },
    { id: 'pkg:react', kind: 'package', name: 'react' },
  ],
  links: [
    { source: 'src/a.ts', target: 'src/inner/b.ts', kind: 'import' },
    { source: 'src/a.ts', target: 'src/inner/c.ts', kind: 'import-type' },
    { source: 'src/inner/b.ts', target: 'src/inner/c.ts', kind: 'import' },
    { source: 'src/inner/c.ts', target: 'pkg:react', kind: 'import' },
  ],
}

describe('filterGraph', () => {
  it('remove arestas cujo lado sumiu junto com o nó', () => {
    const filtered = filterGraph(graph, (n) => n.kind !== 'package')
    expect(filtered.nodes.map((n) => n.id)).not.toContain('pkg:react')
    expect(filtered.links.some((l) => l.target === 'pkg:react')).toBe(false)
  })
})

describe('collapseGraph', () => {
  it('vira um nó só e reaponta as arestas, sem duplicata nem self-loop', () => {
    const collapsed = collapseGraph(graph, new Set(['src/inner']))
    const ids = collapsed.nodes.map((n) => n.id)
    expect(ids).toContain('folder:src/inner')
    expect(ids).not.toContain('src/inner/b.ts')
    expect(ids).not.toContain('src/inner/c.ts')

    // a->b e a->c colapsam na mesma aresta a->folder (mesmo kind 'import' pro caso de b;
    // a->c era import-type, então ficam DUAS arestas distintas por tipo, sem duplicata)
    const fromA = collapsed.links.filter((l) => l.source === 'src/a.ts' && l.target === 'folder:src/inner')
    expect(fromA).toHaveLength(2)

    // b->c era interno à pasta colapsada: vira self-loop e deve sumir
    expect(collapsed.links.some((l) => l.source === 'folder:src/inner' && l.target === 'folder:src/inner')).toBe(false)

    // c->pkg:react sobrevive, reapontada pro nó da pasta
    expect(collapsed.links.some((l) => l.source === 'folder:src/inner' && l.target === 'pkg:react')).toBe(true)

    const folderNode = collapsed.nodes.find((n) => n.id === 'folder:src/inner')
    expect(folderNode?.collapsedCount).toBe(2)
  })

  it('sem pastas colapsadas devolve o grafo original', () => {
    expect(collapseGraph(graph, new Set())).toBe(graph)
  })
})

describe('effectiveNodeId', () => {
  it('aponta pro nó da pasta quando o arquivo está colapsado', () => {
    expect(effectiveNodeId('src/inner/b.ts', new Set(['src/inner']))).toBe('folder:src/inner')
    expect(effectiveNodeId('src/a.ts', new Set(['src/inner']))).toBe('src/a.ts')
  })
})

describe('dependentCounts', () => {
  it('conta origens distintas por destino', () => {
    const counts = dependentCounts(graph.links)
    expect(counts.get('src/inner/c.ts')).toBe(2)
    expect(counts.get('src/inner/b.ts')).toBe(1)
    expect(counts.get('pkg:react')).toBe(1)
  })
})
