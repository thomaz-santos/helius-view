import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import type { AnalyzerRequest, AnalyzerResponse, FileChange, PingResult, WorkerPush } from '../shared/protocol'
import type { SearchResult, SymbolDetail } from '../shared/symbol'
import type { Graph } from '../shared/graph'
import type { TsConfigInfo } from './discover'
import { analyze, toId } from './graph'
import { diffGraph } from './graphPatch'
import { applyFileChanges, graphOf, needsFullReanalysis, stateFromGraph, type LiveGraphState } from './live'
import { indexFile, searchIndex } from './nameIndex'
import { refreshFile, removeFile, resetProjects } from './project'
import { runInBatches } from './schedule'
import { resolveDiscoveredFile, fileFromSymbolId } from './security'
import { buildSymbolGraph, clearAllSymbolCaches, invalidateTopLevelCache, resetAllFilesEnsured } from './symbols'
import { buildSymbolDetail, clearCalledByCache, invalidateCalledByCache } from './symbolDetail'

const { root, exclude } = workerData as { root: string; exclude: string[] }

function emit(e: WorkerPush) {
  parentPort!.postMessage(e)
}

// populado depois do primeiro 'graph' (analyze roda na subida do servidor); symbols/symbol/
// search/filesChanged dependem dele pra validar caminhos e escolher o tsconfig certo.
let discoveryState: { files: string[]; tsconfigs: TsConfigInfo[]; discovered: Set<string> } | undefined
let liveState: LiveGraphState | undefined
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
      liveState = stateFromGraph(result.graph, result.files, root)
      // segundo plano: nunca aguardado aqui, roda em lotes cedendo a vez pras próximas mensagens
      void buildNameIndex(result.files)
      return result.graph satisfies Graph
    }

    case 'currentGraph':
      return (liveState ? graphOf(liveState) : { nodes: [], links: [] }) satisfies Graph

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

    case 'filesChanged':
      handleFileChanges(req.changes)
      return { acked: true }
  }
}

// etapa 5 (atualização ao vivo): tsconfig.json/.gitignore mudou -> reanálise completa
// (decisão do plano: caminho simples e correto); qualquer outro arquivo -> atualização
// incremental só do que mudou, com o diff mandado como graph:patch pro front.
function handleFileChanges(changes: FileChange[]) {
  if (!discoveryState || !liveState) return

  if (needsFullReanalysis(changes)) {
    const prevGraph = graphOf(liveState)
    const result = analyze(root, exclude, () => {})
    discoveryState = {
      files: result.files,
      tsconfigs: result.tsconfigs,
      discovered: new Set(result.files.map((abs) => toId(root, abs))),
    }
    liveState = stateFromGraph(result.graph, result.files, root)
    resetProjects()
    clearAllSymbolCaches()
    clearCalledByCache()
    void buildNameIndex(result.files)

    const patch = diffGraph(prevGraph, result.graph)
    emit({ event: 'graph:patch', ...patch, invalidated: [...discoveryState.discovered] })
    return
  }

  const prevGraph = graphOf(liveState)
  const hadFile = (id: string) => discoveryState!.discovered.has(id)

  for (const c of changes) {
    const abs = path.resolve(root, c.file)
    if (c.type === 'unlink') removeFile(abs)
    else refreshFile(abs)
    if (c.type === 'add' && !hadFile(c.file)) resetAllFilesEnsured()
  }

  const touched = applyFileChanges(root, liveState, discoveryState.tsconfigs, changes)
  discoveryState.discovered = liveState.discovered
  discoveryState.files = [...liveState.discovered].map((id) => path.resolve(root, id))

  const nextGraph = graphOf(liveState)
  const invalidated = new Set(touched)
  // quem importa um arquivo tocado também pode ter chamadas/painel mudados (linha, alvo etc)
  for (const l of [...prevGraph.links, ...nextGraph.links]) {
    if (touched.includes(l.target) && l.kind.startsWith('import')) invalidated.add(l.source)
  }

  for (const id of touched) {
    const abs = path.resolve(root, id)
    invalidateTopLevelCache(abs)
    invalidateCalledByCache(id)

    // índice de nomes (decisão 12): reindexa só o arquivo tocado, não o repo inteiro
    searchEntries = searchEntries.filter((e) => e.file !== id)
    if (liveState.discovered.has(id)) {
      searchEntries.push({ id, kind: 'file', name: path.basename(id), file: id })
      searchEntries.push(...indexFile(root, abs))
    }
  }

  const patch = diffGraph(prevGraph, nextGraph)
  emit({ event: 'graph:patch', ...patch, invalidated: [...invalidated] })
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
