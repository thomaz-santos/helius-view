import { describe, expect, it } from 'vitest'
import { neighborhood } from '../../web/src/lib/neighborhood'

// cadeia a-b-c-d-e
const links = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'c', target: 'd' },
  { source: 'd', target: 'e' },
]

describe('neighborhood', () => {
  it('inclui o selecionado com profundidade 0', () => {
    expect(neighborhood(links, 'a', 0)).toEqual(new Set(['a']))
  })

  it('anda os dois sentidos das arestas até a profundidade pedida', () => {
    expect(neighborhood(links, 'c', 1)).toEqual(new Set(['c', 'b', 'd']))
    expect(neighborhood(links, 'c', 2)).toEqual(new Set(['c', 'b', 'd', 'a', 'e']))
  })

  it('nó isolado sem arestas só contém ele mesmo', () => {
    expect(neighborhood(links, 'zzz', 3)).toEqual(new Set(['zzz']))
  })
})
