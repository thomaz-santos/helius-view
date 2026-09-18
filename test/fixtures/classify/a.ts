import type {
  Foo,
  Bar
} from './types'

const mod = require('./mod')

export const useTypes = (f: Foo, b: Bar) => [f, b, mod]
