import { useEffect, useMemo, useRef, useState } from 'react'
import { searchFiles } from './lib/search'

interface SearchPaletteProps {
  fileIds: string[]
  onSelect: (fileId: string) => void
  onClose: () => void
}

export function SearchPalette({ fileIds, onSelect, onClose }: SearchPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchFiles(fileIds, query, 20), [fileIds, query])

  useEffect(() => setActive(0), [query])
  useEffect(() => inputRef.current?.focus(), [])

  const pick = (id: string | undefined) => {
    if (id) onSelect(id)
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
          placeholder="buscar arquivo…"
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
          {results.map((id, i) => (
            <div
              key={id}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(id)}
              style={{ padding: '6px 10px', background: i === active ? '#1e3a5f' : undefined, cursor: 'pointer', fontSize: 13 }}
            >
              {id}
            </div>
          ))}
          {results.length === 0 && <div style={{ padding: 10, color: '#6b7280' }}>nada encontrado</div>}
        </div>
      </div>
    </div>
  )
}
