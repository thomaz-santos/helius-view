import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverFiles } from '../src/analyzer/discover'
import { buildSymbolGraph } from '../src/analyzer/symbols'
import { buildSymbolDetail } from '../src/analyzer/symbolDetail'
import { resolveDiscoveredFile } from '../src/analyzer/security'

const root = path.join(import.meta.dirname, 'fixtures', 'symbols')
const { files, tsconfigs } = discoverFiles(root, [])
const discovered = new Set(files.map((f) => path.relative(root, f).split(path.sep).join('/')))

function symbolsOf(relFile: string) {
  return buildSymbolGraph(path.resolve(root, relFile), root, tsconfigs, discovered)
}

function detail(id: string) {
  return buildSymbolDetail(id, root, tsconfigs, discovered)
}

function link(graph: ReturnType<typeof symbolsOf>, source: string, target: string, kind?: string) {
  return graph.links.find((l) => l.source === source && l.target === target && (!kind || l.kind === kind))
}

describe('barrel com re-export', () => {
  it('chamada resolve pra declaração original, não pro barrel', () => {
    const graph = symbolsOf('consumer.ts')
    expect(link(graph, 'consumer.ts#consume', 'real.ts#helper', 'call')).toBeDefined()
  })
})

describe('interface com duas implementações', () => {
  it('gera call-possible pras duas, não call direto na interface', () => {
    const graph = symbolsOf('misc.ts')
    expect(link(graph, 'misc.ts#useGreeter', 'impl1.ts#EnglishGreeter.greet', 'call-possible')).toBeDefined()
    expect(link(graph, 'misc.ts#useGreeter', 'impl2.ts#SpanishGreeter.greet', 'call-possible')).toBeDefined()
    expect(graph.links.some((l) => l.source === 'misc.ts#useGreeter' && l.kind === 'call')).toBe(false)
  })
})

describe('default anônimo', () => {
  it('vira #default', () => {
    const graph = symbolsOf('misc.ts')
    expect(graph.nodes.some((n) => n.id === 'misc.ts#default')).toBe(true)
  })
})

describe('sobrecargas', () => {
  it('vira um nó só', () => {
    const graph = symbolsOf('misc.ts')
    expect(graph.nodes.filter((n) => n.name === 'over')).toHaveLength(1)
  })
})

describe('arrow em const', () => {
  it('usa o nome da variável, kind function', () => {
    const graph = symbolsOf('misc.ts')
    const node = graph.nodes.find((n) => n.id === 'misc.ts#arrow')
    expect(node?.kind).toBe('function')
  })
})

describe('get/set', () => {
  it('viram nós com sufixo :get/:set', () => {
    const graph = symbolsOf('misc.ts')
    expect(graph.nodes.some((n) => n.id === 'misc.ts#Box.value:get')).toBe(true)
    expect(graph.nodes.some((n) => n.id === 'misc.ts#Box.value:set')).toBe(true)
  })
})

describe('callback inline', () => {
  it('não vira nó; a chamada dentro dele é atribuída à função que o contém', () => {
    const graph = symbolsOf('misc.ts')
    // dispatch chama arrow (dentro do forEach), não deve existir nó pro callback do forEach
    expect(link(graph, 'misc.ts#dispatch', 'misc.ts#arrow', 'call')).toBeDefined()
    expect(graph.nodes.some((n) => n.name.includes('forEach'))).toBe(false)
  })
})

describe('função passada como argumento', () => {
  it('vira reference, não call', () => {
    const graph = symbolsOf('misc.ts')
    expect(link(graph, 'misc.ts#passRef', 'misc.ts#arrow', 'reference')).toBeDefined()
    expect(link(graph, 'misc.ts#passRef', 'misc.ts#arrow', 'call')).toBeUndefined()
  })
})

describe('chamada não resolvida', () => {
  it('handlers[event]() aparece no painel como unresolved, sem quebrar', () => {
    const d = detail('misc.ts#dispatch')
    expect(d?.calls.unresolved.some((u) => u.label.includes('handlers'))).toBe(true)
  })
})

describe('painel de símbolo', () => {
  it('cinco blocos básicos de helper()', () => {
    const d = detail('real.ts#helper')
    expect(d?.input.params).toEqual([{ name: 'x', type: 'number', optional: false, default: undefined }])
    expect(d?.output.type).toBe('number')
    expect(d?.processing.code).toContain('function helper')
    expect(d?.calledBy.some((c) => c.file === 'consumer.ts')).toBe(true)
  })
})

describe('segurança', () => {
  it('recusa ../ e caminho absoluto', () => {
    expect(resolveDiscoveredFile(root, '../../../etc/passwd', discovered)).toBeUndefined()
    expect(resolveDiscoveredFile(root, path.resolve(root, 'real.ts'), discovered)).toBeUndefined()
    expect(resolveDiscoveredFile(root, 'real.ts', discovered)).toBeDefined()
  })
})
