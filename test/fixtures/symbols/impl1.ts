import type { Greeter } from './base'

export class EnglishGreeter implements Greeter {
  greet(name: string) {
    return 'hello ' + name
  }
}
