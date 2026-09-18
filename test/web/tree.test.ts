import { describe, expect, it } from 'vitest'
import { ancestorFolders, buildTree, folderColorMap, isPathVisible, toggleFolder, topFolder } from '../../web/src/lib/tree'

describe('buildTree', () => {
  it('monta pastas aninhadas a partir dos ids', () => {
    const tree = buildTree(['src/a.ts', 'src/b/c.ts', 'root.ts'])
    expect(tree.children.map((c) => c.name)).toEqual(['src', 'root.ts'])
    const src = tree.children.find((c) => c.name === 'src')
    expect(src?.type).toBe('folder')
    if (src?.type !== 'folder') throw new Error('esperava pasta')
    expect(src.children.map((c) => c.name)).toEqual(['b', 'a.ts'])
    const b = src.children.find((c) => c.name === 'b')
    if (b?.type !== 'folder') throw new Error('esperava pasta')
    expect(b.children).toEqual([{ type: 'file', path: 'src/b/c.ts', name: 'c.ts' }])
  })
})

describe('ancestorFolders', () => {
  it('lista pastas da raiz até o pai direto', () => {
    expect(ancestorFolders('src/analyzer/graph.ts')).toEqual(['src', 'src/analyzer'])
  })

  it('vazio pra arquivo na raiz', () => {
    expect(ancestorFolders('root.ts')).toEqual([])
  })
})

describe('isPathVisible / toggleFolder', () => {
  it('arquivo some quando a pasta é desmarcada', () => {
    const unchecked = toggleFolder(new Set(), 'src/analyzer', false)
    expect(isPathVisible('src/analyzer/graph.ts', unchecked)).toBe(false)
    expect(isPathVisible('src/cli.ts', unchecked)).toBe(true)
  })

  it('marcar a pasta de novo limpa descendentes desmarcados individualmente', () => {
    let unchecked = toggleFolder(new Set(), 'src/analyzer', false)
    unchecked = toggleFolder(unchecked, 'src', true)
    expect(unchecked.size).toBe(0)
    expect(isPathVisible('src/analyzer/graph.ts', unchecked)).toBe(true)
  })
})

describe('topFolder / folderColorMap', () => {
  it('usa o primeiro segmento, ou (raiz) sem pasta', () => {
    expect(topFolder('src/a.ts')).toBe('src')
    expect(topFolder('a.ts')).toBe('(raiz)')
  })

  it('cor estável e distinta por pasta de topo', () => {
    const map = folderColorMap(['src/a.ts', 'web/b.ts', 'test/c.ts'])
    expect(map.get('src')).not.toBe(map.get('web'))
    expect(map.size).toBe(3)
  })
})
