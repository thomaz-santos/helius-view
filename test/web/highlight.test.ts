import { describe, expect, it } from 'vitest'
import { tokenize } from '../../web/src/lib/highlight'

describe('tokenize', () => {
  it('reconhece palavra-chave, string, número, comentário e pontuação', () => {
    const tokens = tokenize(`const x = 1 // um\n`)
    expect(tokens.find((t) => t.text === 'const')?.type).toBe('keyword')
    expect(tokens.find((t) => t.text === '1')?.type).toBe('number')
    expect(tokens.find((t) => t.text.startsWith('// um'))?.type).toBe('comment')
    expect(tokens.find((t) => t.text === '=')?.type).toBe('punct')
  })

  it('reconhece string com aspas simples, duplas e template literal', () => {
    expect(tokenize(`'a'`)[0]).toEqual({ text: "'a'", type: 'string' })
    expect(tokenize(`"a"`)[0]).toEqual({ text: '"a"', type: 'string' })
    expect(tokenize('`a`')[0]).toEqual({ text: '`a`', type: 'string' })
  })

  it('junta os tokens de volta reproduz o texto original', () => {
    const code = 'export function foo(a: number) { return a + 1 }'
    expect(tokenize(code).map((t) => t.text).join('')).toBe(code)
  })
})
