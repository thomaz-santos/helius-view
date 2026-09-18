import { parentPort, workerData } from 'node:worker_threads'
import type { AnalyzerRequest, AnalyzerResponse, PingResult, ProgressEvent } from '../shared/protocol'
import { analyze } from './graph'

const { root, exclude } = workerData as { root: string; exclude: string[] }

function handle(req: AnalyzerRequest): unknown {
  switch (req.type) {
    case 'ping':
      return { pong: true, root } satisfies PingResult
    case 'graph':
      return analyze(root, exclude, (e: ProgressEvent) => parentPort!.postMessage(e))
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
