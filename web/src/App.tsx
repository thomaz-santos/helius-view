import { useEffect, useMemo, useState } from 'react'
import type { Graph } from '../../src/shared/graph'
import type { ProgressEvent } from '../../src/shared/protocol'
import { GraphView } from './GraphView'
import { FolderTree } from './FolderTree'
import { SearchPalette } from './SearchPalette'
import { buildTree, folderColorMap, isPathVisible, toggleFolder } from './lib/tree'
import { collapseGraph, effectiveNodeId, filterGraph } from './lib/collapse'
import { neighborhood } from './lib/neighborhood'
import { parseUrlState, serializeUrlState, type UrlState } from './lib/url'

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urlState, setUrlState] = useState<UrlState>(() => parseUrlState(location.search))
  const [searchOpen, setSearchOpen] = useState(false)

  const { sel: selected, externos: showExternal, depth, isolate } = urlState
  const uncheckedFolders = useMemo(() => new Set(urlState.unchecked), [urlState.unchecked])
  const collapsedFolders = useMemo(() => new Set(urlState.collapsed), [urlState.collapsed])

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json() as Promise<Graph>)
      .then(setGraph)
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onmessage = (evt) => setProgress(JSON.parse(evt.data))
    return () => ws.close()
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

  // sel muda -> pushState (o botão voltar navega entre seleções); resto -> replaceState
  const setUrl = (patch: Partial<UrlState>, push = false) => {
    const next = { ...urlState, ...patch }
    const url = serializeUrlState(next) || location.pathname
    if (push) history.pushState(null, '', url)
    else history.replaceState(null, '', url)
    setUrlState(next)
  }

  const select = (id: string | undefined) => setUrl({ sel: id }, true)

  const fileIds = useMemo(
    () => (graph ? graph.nodes.filter((n) => n.kind === 'file' && n.file !== undefined).map((n) => n.id) : []),
    [graph],
  )
  const tree = useMemo(() => buildTree(fileIds), [fileIds])
  const folderColors = useMemo(() => folderColorMap(fileIds), [fileIds])

  const renderGraph = useMemo(() => {
    if (!graph) return null
    let g = filterGraph(graph, (n) => showExternal || n.kind !== 'package')
    g = filterGraph(g, (n) => n.kind !== 'file' || n.file === undefined || isPathVisible(n.id, uncheckedFolders))
    const collapsedGraph = collapseGraph(g, collapsedFolders)
    if (selected && isolate) {
      const set = neighborhood(collapsedGraph.links, effectiveNodeId(selected, collapsedFolders), depth)
      return filterGraph(collapsedGraph, (n) => set.has(n.id))
    }
    return collapsedGraph
  }, [graph, showExternal, uncheckedFolders, collapsedFolders, selected, isolate, depth])

  const effectiveSelected = selected ? effectiveNodeId(selected, collapsedFolders) : undefined
  const highlightSet = useMemo(() => {
    if (!renderGraph || !effectiveSelected || isolate) return null
    return neighborhood(renderGraph.links, effectiveSelected, depth)
  }, [renderGraph, effectiveSelected, isolate, depth])

  const done = progress?.phase === 'done'
  const percent =
    progress?.phase === 'analyze' ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : done ? 100 : 0

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
        {graph && renderGraph && (
          <span>
            {renderGraph.nodes.length}/{graph.nodes.length} nós, {renderGraph.links.length} arestas
          </span>
        )}
        {progress?.phase === 'discover' && progress.warning && <span style={{ color: '#f59e0b' }}>{progress.warning}</span>}
        {error && <span style={{ color: '#ef4444' }}>{error}</span>}
      </header>
      {!done && (
        <div style={{ height: 4, background: '#1a2230' }}>
          <div style={{ height: '100%', width: `${percent}%`, background: '#38bdf8', transition: 'width 150ms' }} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside style={{ width: 260, borderRight: '1px solid #263041', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
        <div style={{ flex: 1, minHeight: 0 }}>
          {renderGraph && (
            <GraphView graph={renderGraph} folderColors={folderColors} selected={effectiveSelected} highlightSet={highlightSet} onSelect={select} />
          )}
        </div>
      </div>
      {searchOpen && (
        <SearchPalette
          fileIds={fileIds}
          onClose={() => setSearchOpen(false)}
          onSelect={(fileId) => {
            select(effectiveNodeId(fileId, collapsedFolders))
            setSearchOpen(false)
          }}
        />
      )}
    </main>
  )
}
