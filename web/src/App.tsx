import { useEffect, useState } from 'react'
import type { Graph } from '../../src/shared/graph'
import type { ProgressEvent } from '../../src/shared/protocol'
import { GraphView } from './GraphView'

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [showExternal, setShowExternal] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const done = progress?.phase === 'done'
  const percent =
    progress?.phase === 'analyze' ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : done ? 100 : 0

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '8px 12px', borderBottom: '1px solid #263041', display: 'flex', gap: 16, alignItems: 'center' }}>
        <strong>helius-view</strong>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={showExternal} onChange={(e) => setShowExternal(e.target.checked)} />
          mostrar externos
        </label>
        {graph && (
          <span>
            {graph.nodes.length} nós, {graph.links.length} arestas
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
      <div style={{ flex: 1, minHeight: 0 }}>{graph && <GraphView graph={graph} showExternal={showExternal} />}</div>
    </main>
  )
}
