import { parentPort, workerData } from 'node:worker_threads'
import type { AnalyzerRequest, AnalyzerResponse, PingResult } from '../shared/protocol'

const { root } = workerData as { root: string }

function handle(req: AnalyzerRequest): unknown {
  switch (req.type) {
    case 'ping':
      return { pong: true, root } satisfies PingResult
  }
}

parentPort!.on('message', (req: AnalyzerRequest) => {
  let res: AnalyzerResponse
  try {
    res = { id: req.id, ok: true, result: handle(req) }
  } catch (e) {
    res = { id: req.id, ok: false, error: String(e) }
  }
  parentPort!.postMessage(res)
})
