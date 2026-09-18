import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// alvo do servidor compilado (npm run dev sobe ele com `tsup --watch --onSuccess "node dist/cli.js"`)
const SERVER = 'http://127.0.0.1:4317'

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  // npm run dev: o vite serve a página e repassa a API/WS pro servidor compilado.
  // changeOrigin reescreve o Host (senão chega "Host: localhost:5173" e o middleware
  // anti DNS-rebinding do servidor recusa); o /ws também reescreve o Origin do handshake,
  // que o navegador manda como o da aba do vite (localhost:5173), não o do servidor.
  server: {
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/ws': {
        target: SERVER,
        ws: true,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReqWs', (proxyReq) => proxyReq.setHeader('origin', SERVER))
        },
      },
    },
  },
})
