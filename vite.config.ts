import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  // npm run dev: o vite serve a página e repassa a API para o servidor compilado
  server: { proxy: { '/api': 'http://127.0.0.1:4317' } },
})
