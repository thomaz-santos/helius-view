// BFS não-direcionado a partir de `selected`, até `depth` saltos. Inclui o próprio selecionado.
export function neighborhood(links: { source: string; target: string }[], selected: string, depth: number): Set<string> {
  const adj = new Map<string, string[]>()
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push(b)
  }
  for (const l of links) {
    add(l.source, l.target)
    add(l.target, l.source)
  }

  const dist = new Map<string, number>([[selected, 0]])
  const queue: string[] = [selected]
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]!
    const d = dist.get(cur)!
    if (d >= depth) continue
    for (const next of adj.get(cur) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1)
        queue.push(next)
      }
    }
  }

  return new Set(dist.keys())
}
