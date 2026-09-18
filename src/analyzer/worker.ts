import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import type { AnalyzerRequest, AnalyzerResponse, PingResult, ProgressEvent } from '../shared/protocol'
import type { SearchResult, SymbolDetail } from '../shared/symbol'
import type { Graph } from '../shared/graph'
import type { TsConfigInfo } from './discover'
import { analyze } from './graph'
import { indexFile, searchIndex } from './nameIndex'
import { runInBatches } from './schedule'
import { resolveDiscoveredFile, fileFromSymbolId } from './security'
import { buildSymbolGraph } from './symbols'
import { buildSymbolDetail } from './symbolDetail'

const { root, exclude } = workerData as { root: string; exclude: string[] }

function emit(e: ProgressEvent) {
  parentPort!.postMessage(e)
}

// populado depois do primeiro 'graph' (analyze roda na subida do servidor); symbols/symbol/
// search dependem dele pra validar caminhos e escolher o tsconfig certo.
let discoveryState: { files: string[]; tsconfigs: TsConfigInfo[]; discovered: Set<string> } | undefined
let searchEntries: SearchResult[] = []

async function buildNameIndex(files: string[]) {
  const fileEntries: SearchResult[] = files.map((abs) => {
    const rel = path.relative(root, abs).split(path.sep).join('/')
    return { id: rel, kind: 'file', name: path.basename(rel), file: rel }
  })
  searchEntries = fileEntries

  await runInBatches(
    files,
    25,
    (abs) => {
      searchEntries.push(...indexFile(root, abs))
    },
    (done, total) => emit({ event: 'progress', phase: 'index', done, total }),
  )
  emit({ event: 'progress', phase: 'index-done', count: searchEntries.length })
}

function handle(req: AnalyzerRequest): unknown {
  switch (req.type) {
    case 'ping':
      return { pong: true, root } satisfies PingResult

    case 'graph': {
      const result = analyze(root, exclude, emit)
      discoveryState = {
        files: result.files,
        tsconfigs: result.tsconfigs,
        discovered: new Set(result.files.map((abs) => path.relative(root, abs).split(path.sep).join('/'))),
      }
      // segundo plano: nunca aguardado aqui, roda em lotes cedendo a vez pras próximas mensagens
      void buildNameIndex(result.files)
      return result.graph satisfies Graph
    }

    case 'symbols': {
      if (!discoveryState) return { nodes: [], links: [] } satisfies Graph
      const abs = resolveDiscoveredFile(root, req.file, discoveryState.discovered)
      if (!abs) throw new Error(`arquivo fora da raiz analisada ou não descoberto: ${req.file}`)
      return buildSymbolGraph(abs, root, discoveryState.tsconfigs, discoveryState.discovered)
    }

    case 'symbol': {
      if (!discoveryState) return undefined
      const file = fileFromSymbolId(req.symbolId)
      const abs = resolveDiscoveredFile(root, file, discoveryState.discovered)
      if (!abs) throw new Error(`símbolo fora da raiz analisada ou não descoberto: ${req.symbolId}`)
      return buildSymbolDetail(req.symbolId, root, discoveryState.tsconfigs, discoveryState.discovered) satisfies SymbolDetail | undefined
    }

    case 'search':
      return searchIndex(searchEntries, req.query)
  }
}

parentPort!.on('message', (req: AnalyzerRequest) => {
  let res: AnalyzerResponse
  try {
    res = { id: req.id, ok: true, result: handle(req) }
  } catch (e) {
    res = { id: req.id, ok: false, error: String(e) }
  }
  parentPort!.postMessage(res)
})
