export type GraphMode = '2d' | '3d'

export interface UrlState {
  sel?: string
  externos: boolean
  unchecked: string[]
  collapsed: string[]
  depth: number
  isolate: boolean
  mode: GraphMode
  pathFrom?: string
  pathTo?: string
  pathUndirected: boolean
}

export const DEFAULT_DEPTH = 2
const clampDepth = (n: number) => Math.min(5, Math.max(1, Math.round(n)))

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search)
  const depthRaw = Number(p.get('depth'))
  return {
    sel: p.get('sel') ?? undefined,
    externos: p.get('externos') === '1',
    unchecked: (p.get('unchecked') ?? '').split(',').filter(Boolean),
    collapsed: (p.get('collapsed') ?? '').split(',').filter(Boolean),
    depth: Number.isFinite(depthRaw) && depthRaw > 0 ? clampDepth(depthRaw) : DEFAULT_DEPTH,
    isolate: p.get('isolate') === '1',
    mode: p.get('mode') === '3d' ? '3d' : '2d',
    pathFrom: p.get('pathFrom') ?? undefined,
    pathTo: p.get('pathTo') ?? undefined,
    pathUndirected: p.get('pathUndirected') === '1',
  }
}

export function serializeUrlState(state: UrlState): string {
  const p = new URLSearchParams()
  if (state.sel) p.set('sel', state.sel)
  if (state.externos) p.set('externos', '1')
  if (state.unchecked.length) p.set('unchecked', state.unchecked.join(','))
  if (state.collapsed.length) p.set('collapsed', state.collapsed.join(','))
  if (state.depth !== DEFAULT_DEPTH) p.set('depth', String(state.depth))
  if (state.isolate) p.set('isolate', '1')
  if (state.mode !== '2d') p.set('mode', state.mode)
  if (state.pathFrom) p.set('pathFrom', state.pathFrom)
  if (state.pathTo) p.set('pathTo', state.pathTo)
  if (state.pathUndirected) p.set('pathUndirected', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}
