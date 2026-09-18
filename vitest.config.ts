import { defineConfig } from 'vitest/config'

// config própria: sem ela o vitest herda o vite.config.ts e roda com raiz em web/
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } })
