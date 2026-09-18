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
    })
  })

  it('lê todos os campos', () => {
    const state = parseUrlState('?sel=src%2Fa.ts&externos=1&unchecked=web%2Fsrc&collapsed=src%2Finner&depth=4&isolate=1')
    expect(state).toEqual({
      sel: 'src/a.ts',
      externos: true,
      unchecked: ['web/src'],
      collapsed: ['src/inner'],
      depth: 4,
      isolate: true,
    })
  })

  it('sanitiza profundidade fora de 1-5', () => {
    expect(parseUrlState('?depth=99').depth).toBe(5)
    expect(parseUrlState('?depth=0').depth).toBe(DEFAULT_DEPTH)
    expect(parseUrlState('?depth=abc').depth).toBe(DEFAULT_DEPTH)
  })
})

describe('serializeUrlState', () => {
  it('omite campos no valor padrão', () => {
    expect(serializeUrlState({ externos: false, unchecked: [], collapsed: [], depth: DEFAULT_DEPTH, isolate: false })).toBe('')
  })

  it('ida e volta preserva o estado', () => {
    const state = {
      sel: 'src/a.ts',
      externos: true,
      unchecked: ['web/src', 'test'],
      collapsed: ['src/inner'],
      depth: 5,
      isolate: true,
    }
    expect(parseUrlState(serializeUrlState(state))).toEqual(state)
  })
})
