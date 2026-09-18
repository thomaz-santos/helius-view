import type { PathResult } from './lib/path'

interface PathPanelProps {
  from: string
  to: string
  result: PathResult | null
  undirected: boolean
  onToggleUndirected: (v: boolean) => void
  onNavigate: (id: string) => void
  onClose: () => void
}

// etapa 6(b): lista o caminho calculado (BFS pura em lib/path.ts) com itens clicáveis, ou
// "sem caminho" quando a busca não achou nada.
export function PathPanel({ from, to, result, undirected, onToggleUndirected, onNavigate, onClose }: PathPanelProps) {
  return (
    <aside style={{ width: 260, flexShrink: 0, borderLeft: '1px solid #263041', padding: 12, fontSize: 13, overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>caminho</strong>
        <button
          onClick={onClose}
          style={{ background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          title="fechar"
        >
          ×
        </button>
      </div>
      <div style={{ marginTop: 8, color: '#6b7280', wordBreak: 'break-all' }}>
        {from} → {to}
      </div>
      <label style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" checked={undirected} onChange={(e) => onToggleUndirected(e.target.checked)} />
        ignorar direção
      </label>
      <div style={{ marginTop: 12 }}>
        {result === null && <div style={{ color: '#f59e0b' }}>sem caminho</div>}
        {result && (
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {result.nodes.map((id) => (
              <li key={id} style={{ marginBottom: 4 }}>
                <span onClick={() => onNavigate(id)} style={{ cursor: 'pointer', color: '#38bdf8', wordBreak: 'break-all' }}>
                  {id}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
}
