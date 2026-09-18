import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PingResult } from '../../src/shared/protocol'

function App() {
  const [status, setStatus] = useState('conectando…')

  useEffect(() => {
    fetch('/api/ping')
      .then((r) => r.json() as Promise<PingResult>)
      .then((p) => setStatus(`analisador ok — ${p.root}`))
      .catch((e) => setStatus(`analisador fora do ar: ${e}`))
  }, [])

  return (
    <main>
      <h1>helius-view</h1>
      <p>{status}</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
