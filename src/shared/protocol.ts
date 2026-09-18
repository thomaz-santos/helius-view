// Mensagens entre o servidor e a worker do analisador. Toda requisição leva um id; a resposta devolve o mesmo id.
export type AnalyzerRequest = { id: number; type: 'ping' }

export type AnalyzerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

export type PingResult = { pong: true; root: string }
