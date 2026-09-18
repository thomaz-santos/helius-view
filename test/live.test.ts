import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { analyze } from '../src/analyzer/graph'
import { diffGraph } from '../src/analyzer/graphPatch'
import { applyFileChanges, graphOf, needsFullReanalysis, stateFromGraph } from '../src/analyzer/live'
import { refreshFile } from '../src/analyzer/project'
import { buildSymbolGraph, invalidateTopLevelCache } from '../src/analyzer/symbols'

// copia a fixture pra um diretório temporário (não deve depender do chokidar nem de timers
// reais: testa a função que recebe a lista de arquivos alterados, applyFileChanges).
function setupTmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helius-live-'))
  fs.cpSync(path.join(import.meta.dirname, 'fixtures', 'live'), root, { recursive: true })
  return root
}

function link(graph: ReturnType<typeof graphOf>, source: string, target: string) {
  return graph.links.find((l) => l.source === source && l.target === target)
}

describe('atualização ao vivo: patch de nível 1', () => {
  let root: string

  beforeEach(() => {
    root = setupTmpRoot()
  })

  it('editar um arquivo sem mudar imports: patch vazio, mas o arquivo é reportado como tocado', () => {
    const result = analyze(root, [], () => {})
    const state = stateFromGraph(result.graph, result.files, root)
    const prevGraph = graphOf(state)

    fs.writeFileSync(path.join(root, 'b.ts'), `// comentário novo\n${fs.readFileSync(path.join(root, 'b.ts'), 'utf8')}`)
    const touched = applyFileChanges(root, state, result.tsconfigs, [{ file: 'b.ts', type: 'change' }])

    expect(touched).toEqual(['b.ts'])
    const patch = diffGraph(prevGraph, graphOf(state))
    expect(patch.nodes).toEqual({ added: [], removed: [], changed: [] })
    expect(patch.links).toEqual({ added: [], removed: [], changed: [] })
  })

  it('criar um arquivo novo que importa outro: added em nodes e links', () => {
    const result = analyze(root, [], () => {})
    const state = stateFromGraph(result.graph, result.files, root)
    const prevGraph = graphOf(state)

    fs.writeFileSync(path.join(root, 'c.ts'), `import { helper } from './b'\nexport const usesC = () => helper(2)\n`)
    const touched = applyFileChanges(root, state, result.tsconfigs, [{ file: 'c.ts', type: 'add' }])

    expect(touched).toEqual(['c.ts'])
    const patch = diffGraph(prevGraph, graphOf(state))
    expect(patch.nodes.added.map((n) => n.id)).toEqual(['c.ts'])
    expect(link({ nodes: [], links: patch.links.added }, 'c.ts', 'b.ts')).toBeDefined()
  })

  it('apagar um arquivo: removed em nodes e nas arestas que saíam dele', () => {
    const result = analyze(root, [], () => {})
    const state = stateFromGraph(result.graph, result.files, root)
    const prevGraph = graphOf(state)
    expect(link(prevGraph, 'a.ts', 'b.ts')).toBeDefined()

    fs.rmSync(path.join(root, 'a.ts'))
    const touched = applyFileChanges(root, state, result.tsconfigs, [{ file: 'a.ts', type: 'unlink' }])

    expect(touched).toEqual(['a.ts'])
    const nextGraph = graphOf(state)
    expect(nextGraph.nodes.some((n) => n.id === 'a.ts')).toBe(false)
    const patch = diffGraph(prevGraph, nextGraph)
    expect(patch.nodes.removed).toEqual(['a.ts'])
    expect(patch.links.removed).toEqual([{ source: 'a.ts', target: 'b.ts', kind: 'import' }])
  })

  it('criar um ciclo entre dois arquivos: a aresta nova entra circular, a existente vira changed', () => {
    const result = analyze(root, [], () => {})
    const state = stateFromGraph(result.graph, result.files, root)
    const prevGraph = graphOf(state)
    expect(link(prevGraph, 'a.ts', 'b.ts')?.circular).toBeUndefined()

    fs.writeFileSync(path.join(root, 'b.ts'), `import { useHelper } from './a'\nexport function helper(x: number) {\n  return x + (useHelper ? 1 : 0)\n}\n`)
    applyFileChanges(root, state, result.tsconfigs, [{ file: 'b.ts', type: 'change' }])

    const nextGraph = graphOf(state)
    expect(link(nextGraph, 'a.ts', 'b.ts')?.circular).toBe(true)
    expect(link(nextGraph, 'b.ts', 'a.ts')?.circular).toBe(true)

    const patch = diffGraph(prevGraph, nextGraph)
    expect(patch.links.added.some((l) => l.source === 'b.ts' && l.target === 'a.ts' && l.circular)).toBe(true)
    expect(patch.links.changed.some((l) => l.source === 'a.ts' && l.target === 'b.ts' && l.circular)).toBe(true)
  })

  it('tsconfig.json/.gitignore força reanálise completa', () => {
    expect(needsFullReanalysis([{ file: 'src/tsconfig.json', type: 'change' }])).toBe(true)
    expect(needsFullReanalysis([{ file: '.gitignore', type: 'change' }])).toBe(true)
    expect(needsFullReanalysis([{ file: 'src/a.ts', type: 'change' }])).toBe(false)
  })

  it('qualquer tsconfig*.json força reanálise completa (solution style: app/node/build)', () => {
    expect(needsFullReanalysis([{ file: 'tsconfig.app.json', type: 'change' }])).toBe(true)
    expect(needsFullReanalysis([{ file: 'packages/a/tsconfig.node.json', type: 'add' }])).toBe(true)
    expect(needsFullReanalysis([{ file: 'jsconfig.json', type: 'change' }])).toBe(false)
    expect(needsFullReanalysis([{ file: 'src/tsconfig.ts', type: 'change' }])).toBe(false)
  })
})

describe('atualização ao vivo: estabilidade de id no nível 2', () => {
  let root: string

  beforeEach(() => {
    root = setupTmpRoot()
  })

  it('inserir linhas acima de uma função não muda o id dela, só a linha', () => {
    const { tsconfigs } = analyze(root, [], () => {})
    const discovered = new Set(['a.ts', 'b.ts'])
    const before = buildSymbolGraph(path.join(root, 'b.ts'), root, tsconfigs, discovered)
    const beforeLine = before.nodes.find((n) => n.id === 'b.ts#helper')?.line

    const abs = path.join(root, 'b.ts')
    fs.writeFileSync(abs, `// linha 1\n// linha 2\n${fs.readFileSync(abs, 'utf8')}`)
    refreshFile(abs)
    invalidateTopLevelCache(abs)

    const after = buildSymbolGraph(abs, root, tsconfigs, discovered)
    const afterNode = after.nodes.find((n) => n.id === 'b.ts#helper')
    expect(afterNode).toBeDefined()
    expect(afterNode?.line).toBe((beforeLine ?? 0) + 2)
  })

  it('renomear a função gera removed + added (id muda, não é preservado)', () => {
    const { tsconfigs } = analyze(root, [], () => {})
    const discovered = new Set(['a.ts', 'b.ts'])
    const abs = path.join(root, 'b.ts')
    const before = buildSymbolGraph(abs, root, tsconfigs, discovered)

    fs.writeFileSync(abs, `export function helperRenamed(x: number) {\n  return x + 1\n}\n`)
    refreshFile(abs)
    invalidateTopLevelCache(abs)
    const after = buildSymbolGraph(abs, root, tsconfigs, discovered)

    const patch = diffGraph(before, after)
    expect(patch.nodes.removed).toEqual(['b.ts#helper'])
    expect(patch.nodes.added.map((n) => n.id)).toEqual(['b.ts#helperRenamed'])
  })
})
