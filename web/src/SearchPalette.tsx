import { useEffect, useRef, useState } from 'react'
import type { SearchResult } from '../../src/shared/symbol'

interface SearchPaletteProps {
  onSelect: (id: string) => void
  onClose: () => void
}

// decisão 12: índice de nomes (arquivos + símbolos) em segundo plano no servidor; a busca
// aqui só manda a query pra /api/search, que já devolve ranqueado.
export function SearchPalette({ onSelect, onClose }: SearchPaletteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SearchResult[]>) : []))
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]))
    return () => {
      cancelled = true
    }
  }, [query])

  useEffect(() => setActive(0), [results])
  useEffect(() => inputRef.current?.focus(), [])

  const pick = (r: SearchResult | undefined) => {
    if (r) onSelect(r.id)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', paddingTop: '10vh', zIndex: 10 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#111827', border: '1px solid #263041', borderRadius: 8, width: 480, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar arquivo ou símbolo…"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              pick(results[active])
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
          style={{ padding: 10, background: 'transparent', border: 'none', borderBottom: '1px solid #263041', color: '#e2e8f0', fontSize: 14, outline: 'none' }}
        />
        <div style={{ overflow: 'auto' }}>
          {results.map((r, i) => (
            <div
              key={r.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
              style={{ padding: '6px 10px', background: i === active ? '#1e3a5f' : undefined, cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8 }}
            >
              <span style={{ color: '#6b7280', minWidth: 56 }}>{r.kind}</span>
              <span>{r.kind === 'file' ? r.id : `${r.name} — ${r.file}`}</span>
            </div>
          ))}
          {results.length === 0 && <div style={{ padding: 10, color: '#6b7280' }}>nada encontrado</div>}
        </div>
      </div>
    </div>
  )
}
