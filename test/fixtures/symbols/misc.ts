import type { Greeter } from './base'

export default function (x: number) {
  return x * 2
}

export function over(a: number): number
export function over(a: string): string
export function over(a: unknown): unknown {
  return a
}

export class Box {
  private _v = 0
  get value() {
    return this._v
  }
  set value(v: number) {
    this._v = v
  }
}

export const arrow = (x: number) => x + 1

const handlers: Record<string, () => void> = {}
export function dispatch(event: string) {
  handlers[event]()
  ;[1, 2].forEach((n) => arrow(n))
}

export function passRef() {
  return [arrow].map((fn) => fn(1))
}

export function useGreeter(g: Greeter) {
  return g.greet('a')
}
