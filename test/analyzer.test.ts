import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analyzer/graph'
import { discoverFiles } from '../src/analyzer/discover'

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name)
const run = (name: string) => analyze(fixture(name), [], () => {}).graph

function link(graph: ReturnType<typeof run>, from: string, to: string) {
  return graph.links.find((l) => l.source === from && l.target === to)
}

describe('alias de tsconfig', () => {
  it('resolve import via paths/baseUrl', () => {
    const graph = run('alias')
    const l = link(graph, 'src/entry.ts', 'src/util.ts')
    expect(l).toBeDefined()
    expect(l?.unresolved).toBeUndefined()
    expect(l?.kind).toBe('import')
  })
})

describe('barrel com re-export', () => {
  it('segue export * from em cada arquivo', () => {
    const graph = run('barrel')
    expect(link(graph, 'index.ts', 'a.ts')).toBeDefined()
    expect(link(graph, 'index.ts', 'b.ts')).toBeDefined()
    expect(link(graph, 'consumer.ts', 'index.ts')).toBeDefined()
  })
})

describe('dependência circular', () => {
  it('marca as arestas do ciclo a<->b', () => {
    const graph = run('circular')
    const ab = link(graph, 'a.ts', 'b.ts')
    const ba = link(graph, 'b.ts', 'a.ts')
    expect(ab?.circular).toBe(true)
    expect(ba?.circular).toBe(true)
  })
})

describe('JS puro sem tsconfig', () => {
  it('resolve imports relativos com opções padrão', () => {
    const graph = run('js-plain')
    const l = link(graph, 'a.js', 'b.js')
    expect(l).toBeDefined()
    expect(l?.unresolved).toBeUndefined()
  })
})

describe('monorepo com dois tsconfig', () => {
  it('acha os dois tsconfig e usa o mais próximo por arquivo', () => {
    const { tsconfigs } = discoverFiles(fixture('monorepo'), [])
    expect(tsconfigs).toHaveLength(2)
  })

  it('resolve import cruzado entre pacotes', () => {
    const graph = run('monorepo')
    const l = link(graph, 'packages/b/src/index.ts', 'packages/a/src/index.ts')
    expect(l).toBeDefined()
    expect(l?.unresolved).toBeUndefined()
  })
})

describe('import não resolvido', () => {
  it('marca a aresta como unresolved em vez de falhar', () => {
    const graph = run('unresolved')
    const l = graph.links.find((entry) => entry.source === 'a.ts')
    expect(l?.unresolved).toBe(true)
    expect(l?.target).toContain('does-not-exist')
  })
})

describe('tsconfig solution style (vite)', () => {
  it('segue projectReferences em vez de descartar tudo por fileNames vazio', () => {
    const graph = run('vite-like')
    expect(link(graph, 'src/main.ts', 'src/util.ts')).toBeDefined()
    const vc = graph.nodes.find((n) => n.id === 'vite.config.ts')
    expect(vc).toBeDefined()
  })
})

describe('classify(): import type multi-linha e require()', () => {
  it('import type quebrado em várias linhas continua import-type', () => {
    const graph = run('classify')
    const l = link(graph, 'a.ts', 'types.ts')
    expect(l?.kind).toBe('import-type')
  })

  it('require() é import, não import-dynamic', () => {
    const graph = run('classify')
    const l = link(graph, 'a.ts', 'mod.ts')
    expect(l?.kind).toBe('import')
  })
})

describe('alias quebrado', () => {
  it('specifier que bate com paths mas não resolve vira unresolved, não pkg:', () => {
    const graph = run('broken-alias')
    const l = graph.links.find((entry) => entry.source === 'src/entry.ts')
    expect(l?.unresolved).toBe(true)
    expect(l?.target).not.toMatch(/^pkg:/)
  })
})
