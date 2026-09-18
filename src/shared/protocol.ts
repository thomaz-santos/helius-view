import type { EdgeKind, GraphLink, GraphNode } from './graph'

// arquivo alterado no disco (evento do chokidar), já filtrado pelo mesmo escopo/exclusões
// da descoberta (decisão 3); `file` é o caminho relativo à raiz, com '/'.
export type FileChangeType = 'add' | 'change' | 'unlink'
export interface FileChange {
  file: string
  type: FileChangeType
}

// Mensagens entre o servidor e a worker do analisador. Toda requisição leva um id; a resposta devolve o mesmo id.
export type AnalyzerRequest =
  | { id: number; type: 'ping' }
  | { id: number; type: 'graph' }
  | { id: number; type: 'symbols'; file: string }
  | { id: number; type: 'symbol'; symbolId: string }
  | { id: number; type: 'search'; query: string }
  | { id: number; type: 'filesChanged'; changes: FileChange[] }

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

// aresta identificada por source+target+kind (decisão 10: linha nunca entra no id, então
// esse é o identificador estável de uma aresta entre uma atualização ao vivo e outra).
export interface GraphLinkKey {
  source: string
  target: string
  kind: EdgeKind
}

// diferença entre o grafo de nível 1 anterior e o novo, depois de uma mudança no disco
// (decisão 8). `invalidated` são os arquivos cujos símbolos de nível 2 (painel, /api/symbols)
// podem ter mudado: o próprio arquivo alterado e quem o importa.
export interface GraphPatch {
  event: 'graph:patch'
  nodes: { added: GraphNode[]; removed: string[]; changed: GraphNode[] }
  links: { added: GraphLink[]; removed: GraphLinkKey[]; changed: GraphLink[] }
  invalidated: string[]
}

// empurrado pela worker fora do ciclo requisição/resposta (progresso da análise inicial ou
// atualização ao vivo); distinguidos pelo campo `event`.
export type WorkerPush = ProgressEvent | GraphPatch

export type WorkerMessage = AnalyzerResponse | WorkerPush
