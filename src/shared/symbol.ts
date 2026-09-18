// Tipos do painel de símbolo (decisão 5: cinco blocos) e da busca (decisão 12).
import type { NodeKind } from './graph'

export interface SymbolParam {
  name: string
  type: string
  optional: boolean
  default?: string
}

export interface SymbolInput {
  params: SymbolParam[]
}

export interface SymbolOutput {
  type: string
  async: boolean
  promise: boolean
  throws: string[]
}

// intervalo (em caracteres, relativo ao início do código do bloco) de uma chamada dentro
// do processamento, pro front torná-la clicável
export interface CallRange {
  start: number
  end: number
  targetId: string
}

export interface SymbolProcessing {
  code: string
  startLine: number
  calls: CallRange[]
}

export interface CallSite {
  targetId?: string
  label: string
  line: number
}

export interface UnresolvedCall {
  label: string
  line: number
}

export interface SymbolCalls {
  project: CallSite[]
  external: CallSite[]
  unresolved: UnresolvedCall[]
}

export interface CallerRef {
  file: string
  line: number
}

export interface SymbolDetail {
  id: string
  name: string
  kind: NodeKind
  file: string
  line: number
  input: SymbolInput
  output: SymbolOutput
  processing: SymbolProcessing
  calls: SymbolCalls
  calledBy: CallerRef[]
  editorUrl: string
}

export interface SearchResult {
  id: string
  kind: NodeKind
  name: string
  file: string
  line?: number
}
