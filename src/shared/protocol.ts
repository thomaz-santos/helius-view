// Mensagens entre o servidor e a worker do analisador. Toda requisição leva um id; a resposta devolve o mesmo id.
export type AnalyzerRequest =
  | { id: number; type: 'ping' }
  | { id: number; type: 'graph' }
  | { id: number; type: 'symbols'; file: string }
  | { id: number; type: 'symbol'; symbolId: string }
  | { id: number; type: 'search'; query: string }

// Omit<AnalyzerRequest, 'id'> não distribui sobre a união (vira só os campos comuns a
// todas as variantes); esse condicional força a distribuição pra preservar 'file'/
// 'symbolId'/'query' de cada tipo de requisição.
export type AnalyzerRequestBody = AnalyzerRequest extends infer U ? (U extends { id: number } ? Omit<U, 'id'> : never) : never

export type AnalyzerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

export type PingResult = { pong: true; root: string }

// Mensagens fora do ciclo requisição/resposta, empurradas pela worker durante a análise.
export type ProgressEvent =
  | { event: 'progress'; phase: 'discover'; count: number; warning?: string }
  | { event: 'progress'; phase: 'analyze'; done: number; total: number }
  | { event: 'progress'; phase: 'done'; nodes: number; links: number }
  | { event: 'progress'; phase: 'index'; done: number; total: number }
  | { event: 'progress'; phase: 'index-done'; count: number }

export type WorkerMessage = AnalyzerResponse | ProgressEvent
