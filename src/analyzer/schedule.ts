// Fila com prioridade (decisão 13): não existe uma estrutura de fila explícita porque o
// event loop já faz esse trabalho — o worker processa mensagens (requisições do usuário)
// assim que chegam. O trabalho de segundo plano só precisa nunca bloquear a thread por
// muito tempo seguido: roda em lotes pequenos e cede a vez (setImmediate) entre eles, o
// que dá chance de uma requisição do usuário já enfileirada ser atendida antes do próximo lote.
export async function runInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => void,
  onBatch?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    for (const item of items.slice(i, i + batchSize)) fn(item)
    onBatch?.(Math.min(i + batchSize, items.length), items.length)
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
