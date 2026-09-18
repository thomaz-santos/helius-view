import { Worker } from 'node:worker_threads'
import type { AnalyzerRequest, AnalyzerResponse } from '../shared/protocol'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export function startAnalyzer(root: string) {
  // worker.js fica ao lado de cli.js em dist/ (entrada separada no tsup)
  const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: { root } })
  const pending = new Map<number, Pending>()
  let nextId = 1

  worker.on('message', (res: AnalyzerResponse) => {
    const p = pending.get(res.id)
    if (!p) return
    pending.delete(res.id)
    if (res.ok) p.resolve(res.result)
    else p.reject(new Error(res.error))
  })
  worker.on('error', (e: Error) => {
    for (const p of pending.values()) p.reject(e)
    pending.clear()
  })
  worker.unref()

  return {
    request<T>(req: Omit<AnalyzerRequest, 'id'>): Promise<T> {
      const id = nextId++
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        worker.postMessage({ ...req, id })
      })
    },
  }
}
