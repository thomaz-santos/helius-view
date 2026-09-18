// menor trecho de `text` que contém `query` como subsequência (greedy da esquerda pra
// direita), ou undefined se não bate. Usado só pra ordenar: trecho menor = match melhor.
function subsequenceSpan(query: string, text: string): number | undefined {
  let qi = 0
  let first = -1
  let last = -1
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      if (first === -1) first = ti
      last = ti
      qi++
    }
  }
  if (qi < query.length) return undefined
  return last - first + 1
}

export function searchFiles(fileIds: string[], query: string, limit = 50): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return fileIds.slice(0, limit)

  const scored: { id: string; span: number }[] = []
  for (const id of fileIds) {
    const span = subsequenceSpan(q, id.toLowerCase())
    if (span !== undefined) scored.push({ id, span })
  }
  scored.sort((a, b) => a.span - b.span || a.id.length - b.id.length)
  return scored.slice(0, limit).map((s) => s.id)
}
