import { describe, expect, it } from 'vitest'
import { searchFiles } from '../../web/src/lib/search'

const files = ['src/analyzer/graph.ts', 'src/analyzer/imports.ts', 'src/server/index.ts', 'web/src/GraphView.tsx']

describe('searchFiles', () => {
  it('bate por subsequência, não só substring', () => {
    expect(searchFiles(files, 'zzgraph')).toEqual([])
    expect(searchFiles(files, 'algra')).toContain('src/analyzer/graph.ts')
  })

  it('ranqueia o trecho mais justo primeiro', () => {
    const result = searchFiles(files, 'graph')
    expect(result[0]).toBe('src/analyzer/graph.ts') // "graph" contíguo
    expect(result).toContain('web/src/GraphView.tsx')
  })

  it('query vazia devolve a lista (até o limite)', () => {
    expect(searchFiles(files, '', 2)).toEqual(files.slice(0, 2))
  })

  it('é case-insensitive', () => {
    expect(searchFiles(files, 'GRAPH')).toContain('src/analyzer/graph.ts')
  })
})
