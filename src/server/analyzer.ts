import { Worker } from 'node:worker_threads'
import type { AnalyzerRequestBody, WorkerMessage, WorkerPush } from '../shared/protocol'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export function startAnalyzer(root: string, exclude: string[] = []) {
  // worker.js fica ao lado de cli.js em dist/ (entrada separada no tsup)
  const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: { root, exclude } })
  const pending = new Map<number, Pending>()
  // progresso da análise inicial e graph:patch da atualização ao vivo passam pelo mesmo canal
  const progressListeners = new Set<(e: WorkerPush) => void>()
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
    request<T>(req: AnalyzerRequestBody): Promise<T> {
      const id = nextId++
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        worker.postMessage({ ...req, id })
      })
    },
    onProgress(fn: (e: WorkerPush) => void): () => void {
      progressListeners.add(fn)
      return () => progressListeners.delete(fn)
    },
  }
}
