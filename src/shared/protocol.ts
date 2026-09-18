// Mensagens entre o servidor e a worker do analisador. Toda requisição leva um id; a resposta devolve o mesmo id.
export type AnalyzerRequest = { id: number; type: 'ping' } | { id: number; type: 'graph' }

export type AnalyzerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

export type PingResult = { pong: true; root: string }

// Mensagens fora do ciclo requisição/resposta, empurradas pela worker durante a análise.
export type ProgressEvent =
  | { event: 'progress'; phase: 'discover'; count: number; warning?: string }
  | { event: 'progress'; phase: 'analyze'; done: number; total: number }
  | { event: 'progress'; phase: 'done'; nodes: number; links: number }

export type WorkerMessage = AnalyzerResponse | ProgressEvent
