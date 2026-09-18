import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { Graph, GraphLink, GraphNode } from '../../src/shared/graph'
import type { GraphPatch, ProgressEvent } from '../../src/shared/protocol'
import type { SymbolDetail } from '../../src/shared/symbol'
import { GraphView } from './GraphView'
import { FolderTree } from './FolderTree'
import { PathPanel } from './PathPanel'
import { SearchPalette } from './SearchPalette'
import { SymbolPanel } from './SymbolPanel'
import { buildTree, folderColorMap, isPathVisible, toggleFolder } from './lib/tree'
import { collapseGraph, effectiveNodeId, filterGraph } from './lib/collapse'
import { neighborhood } from './lib/neighborhood'
import { applyGraphPatch } from './lib/patch'
import { pathLinkKeySet, shortestPath } from './lib/path'
import { parseUrlState, serializeUrlState, type UrlState } from './lib/url'

// etapa 6(a): three.js só entra no bundle de quem liga o modo 3D (import() dinâmico)
const GraphView3D = lazy(() => import('./GraphView3D').then((m) => ({ default: m.GraphView3D })))

const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 10_000

export function App() {
  const [graphBase, setGraphBase] = useState<Graph | null>(null)
  const [extraNodes, setExtraNodes] = useState<GraphNode[]>([])
  const [extraLinks, setExtraLinks] = useState<GraphLink[]>([])
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urlState, setUrlState] = useState<UrlState>(() => parseUrlState(location.search))
  const [searchOpen, setSearchOpen] = useState(false)
  // etapa 6(b): a busca também serve pra escolher o destino de "caminho até…" (Ctrl+K normal
  // segue selecionando um nó; nesse modo o resultado vira pathTo em vez de sel)
  const [searchMode, setSearchMode] = useState<'select' | 'path-to'>('select')
  const [showTypes, setShowTypes] = useState(false)
  const [symbolDetail, setSymbolDetail] = useState<SymbolDetail | null>(null)
  const [liveWarning, setLiveWarning] = useState<string | null>(null)

  const { sel: selected, externos: showExternal, depth, isolate, mode, pathFrom, pathTo, pathUndirected } = urlState
  const uncheckedFolders = useMemo(() => new Set(urlState.unchecked), [urlState.unchecked])
  const collapsedFolders = useMemo(() => new Set(urlState.collapsed), [urlState.collapsed])

  // lidas dentro do handler de graph:patch, que vive num efeito de montagem só (a conexão
  // WS não pode ser recriada a cada re-render) — refs mantêm essas leituras "vivas"
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const expandedFilesRef = useRef(expandedFiles)
  expandedFilesRef.current = expandedFiles

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json() as Promise<Graph>)
      .then(setGraphBase)
      .catch((e) => setError(String(e)))
  }, [])

  // etapa 5: aplica o patch preservando o resto do estado do grafo (GraphView herda x/y/vx/vy
  // por id quando `graph` muda); arquivo expandido invalidado recarrega símbolos, símbolo
  // aberto no painel recarrega ou fecha com aviso se deixou de existir, seleção some se o nó
  // selecionado foi removido.
  const applyLivePatch = (patch: GraphPatch) => {
    setGraphBase((prev) => (prev ? applyGraphPatch(prev, patch) : prev))

    for (const fileId of patch.nodes.removed) {
      setExpandedFiles((prev) => {
        if (!prev.has(fileId)) return prev
        const next = new Set(prev)
        next.delete(fileId)
        return next
      })
      setExtraNodes((prev) => prev.filter((n) => n.file !== fileId))
      setExtraLinks((prev) => prev.filter((l) => !l.source.startsWith(`${fileId}#`)))
    }

    for (const fileId of patch.invalidated) {
      if (expandedFilesRef.current.has(fileId)) reloadFileSymbols(fileId)
    }

    const sel = selectedRef.current
    if (sel) {
      const hash = sel.indexOf('#')
      if (hash === -1) {
        if (patch.nodes.removed.includes(sel)) setUrl({ sel: undefined })
      } else if (patch.invalidated.includes(sel.slice(0, hash))) {
        reloadSelectedSymbol(sel)
      }
    }
  }
  const applyLivePatchRef = useRef(applyLivePatch)
  applyLivePatchRef.current = applyLivePatch

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket
    let attempt = 0
    let stopped = false

    const connect = () => {
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => {
        // reconexão (decisão 8): sem reenvio de mensagens perdidas, busca o grafo inteiro de novo
        if (attempt > 0) {
          fetch('/api/graph')
            .then((r) => r.json() as Promise<Graph>)
            .then(setGraphBase)
            .catch(() => {})
        }
        attempt = 0
      }
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data)
        if (msg.event === 'graph:patch') applyLivePatchRef.current(msg as GraphPatch)
        else setProgress(msg)
      }
      ws.onclose = () => {
        if (stopped) return
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
        attempt++
        setTimeout(connect, delay)
      }
    }
    connect()
    return () => {
      stopped = true
      ws.close()
    }
  }, [])

  // voltar/avançar do navegador navega entre seleções (sel usa pushState)
  useEffect(() => {
    const onPop = () => setUrlState(parseUrlState(location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // sel muda -> pushState (o botão voltar navega entre seleções); resto -> replaceState.
  // Atualização funcional (não fecha sobre `urlState`): o handler de graph:patch chama isso
  // de dentro de um efeito de montagem só, onde `urlState` do closure ficaria obsoleto.
  const setUrl = (patch: Partial<UrlState>, push = false) => {
    setUrlState((cur) => {
      const next = { ...cur, ...patch }
      const url = serializeUrlState(next) || location.pathname
      if (push) history.pushState(null, '', url)
      else history.replaceState(null, '', url)
      return next
    })
  }

  const select = (id: string | undefined) => {
    setLiveWarning(null)
    setUrl({ sel: id }, true)
  }

  // navega pra um símbolo (id caminho#nome) clicado numa chamada: expande o arquivo dono
  // primeiro se ainda não tiver sido expandido, senão o nó de destino nem existe no grafo
  const navigateTo = (id: string) => {
    const hash = id.indexOf('#')
    if (hash !== -1) expandFile(id.slice(0, hash))
    select(id)
  }

  // busca os símbolos de um arquivo e substitui as entradas anteriores dele em
  // extraNodes/extraLinks — usada tanto pra expandir (nível 2, decisão 2) quanto pra
  // recarregar um arquivo expandido invalidado por uma atualização ao vivo (etapa 5)
  const reloadFileSymbols = (fileId: string) => {
    fetch(`/api/symbols?file=${encodeURIComponent(fileId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Graph>) : { nodes: [], links: [] }))
      .then((g) => {
        setExtraNodes((prev) => [...prev.filter((n) => n.file !== fileId), ...g.nodes])
        setExtraLinks((prev) => [...prev.filter((l) => !l.source.startsWith(`${fileId}#`)), ...g.links])
      })
  }

  const expandFile = (fileId: string) => {
    if (expandedFiles.has(fileId)) return
    setExpandedFiles((prev) => new Set(prev).add(fileId))
    reloadFileSymbols(fileId)
  }

  // símbolo aberto no painel foi invalidado por uma atualização ao vivo (etapa 5): recarrega
  // os cinco blocos, ou fecha o painel com aviso se o símbolo deixou de existir
  const reloadSelectedSymbol = (symId: string) => {
    fetch(`/api/symbol?id=${encodeURIComponent(symId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SymbolDetail>) : null))
      .then((d) => {
        if (d) {
          setSymbolDetail(d)
        } else {
          setLiveWarning(`símbolo removido: ${symId}`)
          setUrl({ sel: undefined })
        }
      })
  }

  const graph = useMemo(() => {
    if (!graphBase) return null
    if (extraNodes.length === 0 && extraLinks.length === 0) return graphBase
    const byId = new Map(graphBase.nodes.map((n) => [n.id, n]))
    for (const n of extraNodes) byId.set(n.id, n)
    return { nodes: [...byId.values()], links: [...graphBase.links, ...extraLinks] }
  }, [graphBase, extraNodes, extraLinks])

  const fileIds = useMemo(
    () => (graphBase ? graphBase.nodes.filter((n) => n.kind === 'file' && n.file !== undefined).map((n) => n.id) : []),
    [graphBase],
  )
  const tree = useMemo(() => buildTree(fileIds), [fileIds])
  const folderColors = useMemo(() => folderColorMap(fileIds), [fileIds])

  const renderGraph = useMemo(() => {
    if (!graph) return null
    let g = filterGraph(graph, (n) => showExternal || n.kind !== 'package')
    g = filterGraph(g, (n) => showTypes || n.kind !== 'type')
    g = filterGraph(g, (n) => n.kind !== 'file' || n.file === undefined || isPathVisible(n.id, uncheckedFolders))
    const collapsedGraph = collapseGraph(g, collapsedFolders)
    if (selected && isolate) {
      const set = neighborhood(collapsedGraph.links, effectiveNodeId(selected, collapsedFolders), depth)
      return filterGraph(collapsedGraph, (n) => set.has(n.id))
    }
    return collapsedGraph
  }, [graph, showExternal, showTypes, uncheckedFolders, collapsedFolders, selected, isolate, depth])

  const effectiveSelected = selected ? effectiveNodeId(selected, collapsedFolders) : undefined
  const selectedNode = graph?.nodes.find((n) => n.id === effectiveSelected)

  // etapa 6(b): caminho entre dois nós — BFS pura sobre o grafo carregado (não o filtrado/
  // colapsado: origem/destino vêm da busca ou de um clique, sempre com o id "real")
  const pathActive = Boolean(pathFrom && pathTo)
  const pathResult = useMemo(() => {
    if (!pathActive || !graph) return null
    return shortestPath(graph.links, pathFrom!, pathTo!, pathUndirected)
  }, [pathActive, graph, pathFrom, pathTo, pathUndirected])
  const pathNodeSet = useMemo(() => (pathResult ? new Set(pathResult.nodes) : null), [pathResult])
  const pathLinkKeys = useMemo(() => pathLinkKeySet(pathResult), [pathResult])

  const highlightSet = useMemo(() => {
    if (pathActive) return pathNodeSet
    if (!renderGraph || !effectiveSelected || isolate) return null
    return neighborhood(renderGraph.links, effectiveSelected, depth)
  }, [pathActive, pathNodeSet, renderGraph, effectiveSelected, isolate, depth])

  const startPath = (toId: string) => {
    if (!selected) return
    setUrl({ pathFrom: selected, pathTo: toId })
  }
  const clearPath = () => setUrl({ pathFrom: undefined, pathTo: undefined })
  // shift+clique escolhe o destino direto, sem abrir a busca (decisão do plano pra etapa 6)
  const onShiftSelect = (id: string) => {
    if (selected && selected !== id) startPath(id)
    else select(id)
  }

  // painel de símbolo: busca os cinco blocos quando o selecionado é um id de símbolo
  // (caminho#nome) — verifica pelo formato do id, não pelo nó já estar no grafo atual, pra
  // funcionar mesmo navegando pra um símbolo de um arquivo ainda não expandido
  useEffect(() => {
    if (!selected || !selected.includes('#')) {
      setSymbolDetail(null)
      return
    }
    let cancelled = false
    fetch(`/api/symbol?id=${encodeURIComponent(selected)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SymbolDetail>) : null))
      .then((d) => !cancelled && setSymbolDetail(d))
    return () => {
      cancelled = true
    }
  }, [selected, selectedNode?.kind])

  const done = progress?.phase === 'done'
  const percent =
    progress?.phase === 'analyze' ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : done ? 100 : 0
  const indexing = progress?.phase === 'index'

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{ padding: '8px 12px', borderBottom: '1px solid #263041', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <strong>helius-view</strong>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={showExternal} onChange={(e) => setUrl({ externos: e.target.checked })} />
          mostrar externos
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={showTypes} onChange={(e) => setShowTypes(e.target.checked)} />
          mostrar tipos
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={isolate} onChange={(e) => setUrl({ isolate: e.target.checked })} disabled={!selected} />
          isolar
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          profundidade
          <input
            type="range"
            min={1}
            max={5}
            value={depth}
            onChange={(e) => setUrl({ depth: Number(e.target.value) })}
            disabled={!selected}
          />
          {depth}
        </label>
        <button onClick={() => setSearchOpen(true)} style={{ background: '#1a2230', color: '#e2e8f0', border: '1px solid #263041', borderRadius: 4, padding: '2px 8px' }}>
          Ctrl+K buscar
        </button>
        <div style={{ display: 'flex', border: '1px solid #263041', borderRadius: 4, overflow: 'hidden' }}>
          {(['2d', '3d'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setUrl({ mode: m })}
              style={{
                background: mode === m ? '#1e3a5f' : '#1a2230',
                color: '#e2e8f0',
                border: 'none',
                padding: '2px 10px',
                cursor: 'pointer',
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setSearchMode('path-to')
            setSearchOpen(true)
          }}
          disabled={!selected}
          style={{ background: '#1a2230', color: '#e2e8f0', border: '1px solid #263041', borderRadius: 4, padding: '2px 8px' }}
        >
          caminho até… <span style={{ color: '#6b7280' }}>(ou shift+clique)</span>
        </button>
        {graph && renderGraph && (
          <span>
            {renderGraph.nodes.length}/{graph.nodes.length} nós, {renderGraph.links.length} arestas
          </span>
        )}
        {indexing && <span style={{ color: '#6b7280' }}>indexando símbolos… {progress.done}/{progress.total}</span>}
        {progress?.phase === 'discover' && progress.warning && <span style={{ color: '#f59e0b' }}>{progress.warning}</span>}
        {error && <span style={{ color: '#ef4444' }}>{error}</span>}
        {liveWarning && <span style={{ color: '#f59e0b' }}>{liveWarning}</span>}
      </header>
      {!done && (
        <div style={{ height: 4, background: '#1a2230' }}>
          <div style={{ height: '100%', width: `${percent}%`, background: '#38bdf8', transition: 'width 150ms' }} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside style={{ width: 260, flexShrink: 0, borderRight: '1px solid #263041', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <FolderTree
            tree={tree}
            uncheckedFolders={uncheckedFolders}
            collapsedFolders={collapsedFolders}
            selected={selected}
            onToggleVisible={(path, checked) => setUrl({ unchecked: [...toggleFolder(uncheckedFolders, path, checked)] })}
            onToggleCollapsed={(path) => {
              const next = new Set(collapsedFolders)
              next.has(path) ? next.delete(path) : next.add(path)
              setUrl({ collapsed: [...next] })
            }}
            onSelectFile={(fileId) => select(effectiveNodeId(fileId, collapsedFolders))}
          />
          <div style={{ borderTop: '1px solid #263041', padding: 8, fontSize: 12 }}>
            {[...folderColors.entries()].map(([folder, color]) => (
              <div key={folder} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                {folder}
              </div>
            ))}
          </div>
        </aside>
        <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          {renderGraph &&
            (mode === '3d' ? (
              <Suspense fallback={<div style={{ padding: 12, color: '#6b7280' }}>carregando 3D…</div>}>
                <GraphView3D
                  graph={renderGraph}
                  folderColors={folderColors}
                  selected={effectiveSelected}
                  highlightSet={highlightSet}
                  onSelect={select}
                  onExpandFile={expandFile}
                  pathLinkKeys={pathLinkKeys}
                  onShiftSelect={onShiftSelect}
                />
              </Suspense>
            ) : (
              <GraphView
                graph={renderGraph}
                folderColors={folderColors}
                selected={effectiveSelected}
                highlightSet={highlightSet}
                onSelect={select}
                onExpandFile={expandFile}
                pathLinkKeys={pathLinkKeys}
                onShiftSelect={onShiftSelect}
              />
            ))}
        </div>
        {selectedNode?.kind === 'file' && selectedNode.file && (
          <aside style={{ width: 260, flexShrink: 0, borderLeft: '1px solid #263041', padding: 12, fontSize: 13 }}>
            <strong>{selectedNode.file}</strong>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => expandFile(selectedNode.file!)}
                disabled={expandedFiles.has(selectedNode.file)}
                style={{ background: '#1a2230', color: '#e2e8f0', border: '1px solid #263041', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
              >
                {expandedFiles.has(selectedNode.file) ? 'símbolos carregados' : 'expandir símbolos'}
              </button>
            </div>
            <div style={{ marginTop: 8, color: '#6b7280' }}>duplo clique no nó também expande</div>
          </aside>
        )}
        {symbolDetail && <SymbolPanel detail={symbolDetail} onNavigate={navigateTo} onClose={() => select(undefined)} />}
        {pathActive && (
          <PathPanel
            from={pathFrom!}
            to={pathTo!}
            result={pathResult}
            undirected={pathUndirected}
            onToggleUndirected={(v) => setUrl({ pathUndirected: v })}
            onNavigate={navigateTo}
            onClose={clearPath}
          />
        )}
      </div>
      {searchOpen && (
        <SearchPalette
          onClose={() => {
            setSearchOpen(false)
            setSearchMode('select')
          }}
          onSelect={(id) => {
            if (searchMode === 'path-to') startPath(id)
            else select(effectiveNodeId(id, collapsedFolders))
            setSearchOpen(false)
            setSearchMode('select')
          }}
        />
      )}
    </main>
  )
}
