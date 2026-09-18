import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { startAnalyzer } from './analyzer'
import type { PingResult, ProgressEvent } from '../shared/protocol'
import type { Graph } from '../shared/graph'

const MAX_PORT_TRIES = 10

export async function startServer(root: string, port: number, exclude: string[] = []): Promise<number> {
  const analyzer = startAnalyzer(root, exclude)
  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get('/api/ping', async (c) => c.json(await analyzer.request<PingResult>({ type: 'ping' })))

  // dispara a análise assim que o servidor sobe; GET /api/graph e /ws reaproveitam a mesma
  const graphPromise = analyzer.request<Graph>({ type: 'graph' })
  app.get('/api/graph', async (c) => c.json(await graphPromise))

  // último evento de progresso, pra quem conectar no WS depois da análise já ter avançado
  let lastProgress: ProgressEvent | undefined
  analyzer.onProgress((e) => {
    lastProgress = e
  })

  app.get(
    '/ws',
    upgradeWebSocket(() => {
      let off: (() => void) | undefined
      return {
        onOpen(_evt, ws) {
          if (lastProgress) ws.send(JSON.stringify(lastProgress))
          off = analyzer.onProgress((e) => ws.send(JSON.stringify(e)))
        },
        onClose() {
          off?.()
        },
      }
    }),
  )

  // serveStatic resolve `root` a partir do cwd
  const webDir = path.relative(process.cwd(), fileURLToPath(new URL('./web', import.meta.url))) || '.'
  app.use('*', serveStatic({ root: webDir }))

  const listen = (p: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = serve({ fetch: app.fetch, port: p, hostname: '127.0.0.1' }, (info) => resolve(info.port))
      injectWebSocket(server)
      server.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE' && p < port + MAX_PORT_TRIES - 1) resolve(listen(p + 1))
        else reject(e)
      })
    })

  return listen(port)
}
