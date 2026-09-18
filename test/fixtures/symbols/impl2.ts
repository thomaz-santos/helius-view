import type { Greeter } from './base'

export class SpanishGreeter implements Greeter {
  greet(name: string) {
    return 'hola ' + name
  }
}
