import { describe, expect, it } from 'vitest'
import { pathLinkKeySet, shortestPath } from '../../web/src/lib/path'
import { linkKey, type GraphLink } from '../../src/shared/graph'

const l = (source: string, target: string, kind: GraphLink['kind'] = 'import'): GraphLink => ({ source, target, kind })

describe('shortestPath', () => {
  it('caminho direto por uma cadeia a->b->c->d', () => {
    const links = [l('a', 'b'), l('b', 'c'), l('c', 'd')]
    const result = shortestPath(links, 'a', 'd')
    expect(result?.nodes).toEqual(['a', 'b', 'c', 'd'])
    expect(result?.links).toEqual([l('a', 'b'), l('b', 'c'), l('c', 'd')])
  })

  it('sem caminho: direção errada sem undirected', () => {
    const links = [l('a', 'b')]
    expect(shortestPath(links, 'b', 'a')).toBeNull()
  })

  it('origem igual a destino: caminho trivial sem arestas', () => {
    const links = [l('a', 'b')]
    expect(shortestPath(links, 'a', 'a')).toEqual({ nodes: ['a'], links: [] })
  })

  it('ciclo: acha o caminho mais curto sem entrar em loop infinito', () => {
    const links = [l('a', 'b'), l('b', 'c'), l('c', 'a'), l('b', 'd')]
    const result = shortestPath(links, 'a', 'd')
    expect(result?.nodes).toEqual(['a', 'b', 'd'])
  })

  it('undirected: anda contra o sentido da aresta', () => {
    const links = [l('a', 'b'), l('c', 'b')]
    expect(shortestPath(links, 'a', 'c')).toBeNull()
    const result = shortestPath(links, 'a', 'c', true)
    expect(result?.nodes).toEqual(['a', 'b', 'c'])
  })

  it('escolhe o menor caminho quando há mais de um', () => {
    const links = [l('a', 'b'), l('b', 'z'), l('a', 'c'), l('c', 'd'), l('d', 'z')]
    const result = shortestPath(links, 'a', 'z')
    expect(result?.nodes).toEqual(['a', 'b', 'z'])
  })
})

describe('pathLinkKeySet', () => {
  it('chave estável source+target+kind, vazio quando não há caminho', () => {
    const result = shortestPath([l('a', 'b', 'call')], 'a', 'b')
    expect(pathLinkKeySet(result).has(linkKey({ source: 'a', target: 'b', kind: 'call' }))).toBe(true)
    expect(pathLinkKeySet(null).size).toBe(0)
  })
})
