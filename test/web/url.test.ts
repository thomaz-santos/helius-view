import { describe, expect, it } from 'vitest'
import { DEFAULT_DEPTH, parseUrlState, serializeUrlState } from '../../web/src/lib/url'

describe('parseUrlState', () => {
  it('valores padrão pra query string vazia', () => {
    expect(parseUrlState('')).toEqual({
      sel: undefined,
      externos: false,
      unchecked: [],
      collapsed: [],
      depth: DEFAULT_DEPTH,
      isolate: false,
      mode: '2d',
      pathFrom: undefined,
      pathTo: undefined,
      pathUndirected: false,
    })
  })

  it('lê todos os campos', () => {
    const state = parseUrlState(
      '?sel=src%2Fa.ts&externos=1&unchecked=web%2Fsrc&collapsed=src%2Finner&depth=4&isolate=1&mode=3d&pathFrom=a.ts&pathTo=b.ts&pathUndirected=1',
    )
    expect(state).toEqual({
      sel: 'src/a.ts',
      externos: true,
      unchecked: ['web/src'],
      collapsed: ['src/inner'],
      depth: 4,
      isolate: true,
      mode: '3d',
      pathFrom: 'a.ts',
      pathTo: 'b.ts',
      pathUndirected: true,
    })
  })

  it('sanitiza profundidade fora de 1-5', () => {
    expect(parseUrlState('?depth=99').depth).toBe(5)
    expect(parseUrlState('?depth=0').depth).toBe(DEFAULT_DEPTH)
    expect(parseUrlState('?depth=abc').depth).toBe(DEFAULT_DEPTH)
  })

  it('mode inválido ou ausente cai pra 2d', () => {
    expect(parseUrlState('').mode).toBe('2d')
    expect(parseUrlState('?mode=vr').mode).toBe('2d')
    expect(parseUrlState('?mode=3d').mode).toBe('3d')
  })
})

describe('serializeUrlState', () => {
  it('omite campos no valor padrão', () => {
    expect(
      serializeUrlState({ externos: false, unchecked: [], collapsed: [], depth: DEFAULT_DEPTH, isolate: false, mode: '2d', pathUndirected: false }),
    ).toBe('')
  })

  it('ida e volta preserva o estado', () => {
    const state = {
      sel: 'src/a.ts',
      externos: true,
      unchecked: ['web/src', 'test'],
      collapsed: ['src/inner'],
      depth: 5,
      isolate: true,
      mode: '3d' as const,
      pathFrom: 'a.ts',
      pathTo: 'b.ts',
      pathUndirected: true,
    }
    expect(parseUrlState(serializeUrlState(state))).toEqual(state)
  })
})
