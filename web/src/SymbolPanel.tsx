import type { CSSProperties, ReactNode } from 'react'
import type { SymbolDetail, CallRange } from '../../src/shared/symbol'
import { tokenize } from './lib/highlight'

interface SymbolPanelProps {
  detail: SymbolDetail
  onNavigate: (id: string) => void
  onClose: () => void
}

function renderTokens(text: string, keyPrefix: string) {
  return tokenize(text).map((t, i) => (
    <span key={`${keyPrefix}-${i}`} className={`tok-${t.type}`}>
      {t.text}
    </span>
  ))
}

// intervalos de chamada (decisão f: clicáveis) recortam o código em trechos; cada trecho
// ainda passa pelo tokenizador pra manter o realce de sintaxe dentro do span clicável.
function renderCode(code: string, calls: CallRange[], onNavigate: (id: string) => void) {
  const sorted = [...calls].sort((a, b) => a.start - b.start)
  const nodes: ReactNode[] = []
  let pos = 0
  sorted.forEach((c, i) => {
    if (c.start > pos) nodes.push(<span key={`t${i}`}>{renderTokens(code.slice(pos, c.start), `t${i}`)}</span>)
    nodes.push(
      <span
        key={`c${i}`}
        onClick={() => onNavigate(c.targetId)}
        style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
        title={`ir para ${c.targetId}`}
      >
        {renderTokens(code.slice(c.start, c.end), `c${i}`)}
      </span>,
    )
    pos = c.end
  })
  if (pos < code.length) nodes.push(<span key="tail">{renderTokens(code.slice(pos), 'tail')}</span>)
  return nodes
}

export function SymbolPanel({ detail, onNavigate, onClose }: SymbolPanelProps) {
  return (
    <aside
      style={{
        width: 420,
        flexShrink: 0,
        borderLeft: '1px solid #263041',
        overflow: 'auto',
        padding: 12,
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
        <div>
          <strong>{detail.name}</strong>
          <div style={{ color: '#6b7280' }}>
            {detail.kind} · {detail.file}:{detail.line}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer', fontSize: 16 }}>
          ×
        </button>
      </div>

      <a href={detail.editorUrl} style={{ color: '#38bdf8' }}>
        abrir no editor
      </a>

      <section>
        <h4 style={sectionTitle}>Entrada</h4>
        {detail.input.params.length === 0 ? (
          <div style={{ color: '#6b7280' }}>sem parâmetros</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {detail.input.params.map((p) => (
              <li key={p.name}>
                <code>
                  {p.name}
                  {p.optional ? '?' : ''}: {p.type}
                  {p.default ? ` = ${p.default}` : ''}
                </code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 style={sectionTitle}>Saída</h4>
        <div>
          <code>{detail.output.type}</code>
          {detail.output.async && <span style={badge}>async</span>}
          {detail.output.promise && <span style={badge}>promise</span>}
        </div>
        {detail.output.throws.length > 0 && (
          <div style={{ marginTop: 4, color: '#f59e0b' }}>throws: {detail.output.throws.join(', ')}</div>
        )}
      </section>

      <section>
        <h4 style={sectionTitle}>Processamento</h4>
        <pre style={codeBlock}>
          <code>{renderCode(detail.processing.code, detail.processing.calls, onNavigate)}</code>
        </pre>
      </section>

      <section>
        <h4 style={sectionTitle}>Chama</h4>
        {detail.calls.project.length > 0 && (
          <div>
            <div style={{ color: '#6b7280' }}>projeto</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {detail.calls.project.map((c, i) => (
                <li key={i}>
                  <a onClick={() => onNavigate(c.targetId!)} style={{ cursor: 'pointer', color: '#38bdf8' }}>
                    {c.label}
                  </a>{' '}
                  (linha {c.line})
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail.calls.external.length > 0 && (
          <div>
            <div style={{ color: '#6b7280' }}>externo/nativo</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {detail.calls.external.map((c, i) => (
                <li key={i}>
                  {c.label} (linha {c.line})
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail.calls.unresolved.length > 0 && (
          <div>
            <div style={{ color: '#f59e0b' }}>não resolvidas</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {detail.calls.unresolved.map((c, i) => (
                <li key={i}>
                  {c.label} (linha {c.line})
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail.calls.project.length === 0 && detail.calls.external.length === 0 && detail.calls.unresolved.length === 0 && (
          <div style={{ color: '#6b7280' }}>não chama nada</div>
        )}
      </section>

      <section>
        <h4 style={sectionTitle}>É chamada por</h4>
        {detail.calledBy.length === 0 ? (
          <div style={{ color: '#6b7280' }}>ninguém chama (no projeto)</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {detail.calledBy.map((c, i) => (
              <li key={i}>
                {c.file}:{c.line}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

const sectionTitle: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', color: '#6b7280', letterSpacing: 0.5 }
const badge: CSSProperties = { marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: '#1a2230', fontSize: 11 }
const codeBlock: CSSProperties = {
  background: '#0b0f14',
  border: '1px solid #263041',
  borderRadius: 6,
  padding: 8,
  overflow: 'auto',
  maxHeight: 260,
  whiteSpace: 'pre',
}
