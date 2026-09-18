import { defineConfig } from 'tsup'

export default defineConfig({
  // a worker é uma entrada própria: o servidor a carrega como dist/worker.js
  entry: { cli: 'src/cli.ts', worker: 'src/analyzer/worker.ts' },
  format: 'esm',
  target: 'node20',
  splitting: false,
})
