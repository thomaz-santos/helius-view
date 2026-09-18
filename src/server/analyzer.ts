import { Worker } from 'node:worker_threads'
import type { AnalyzerRequest, ProgressEvent, WorkerMessage } from '../shared/protocol'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export function startAnalyzer(root: string, exclude: string[] = []) {
  // worker.js fica ao lado de cli.js em dist/ (entrada separada no tsup)
  const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: { root, exclude } })
  const pending = new Map<number, Pending>()
  const progressListeners = new Set<(e: ProgressEvent) => void>()
  let nextId = 1

  worker.on('message', (msg: WorkerMessage) => {
    if ('event' in msg) {
      for (const l of progressListeners) l(msg)
      return
    }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error))
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
    onProgress(fn: (e: ProgressEvent) => void): () => void {
      progressListeners.add(fn)
      return () => progressListeners.delete(fn)
    },
  }
}
