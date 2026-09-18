import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { startAnalyzer } from './analyzer'
import type { PingResult } from '../shared/protocol'

const MAX_PORT_TRIES = 10

export async function startServer(root: string, port: number): Promise<number> {
  const analyzer = startAnalyzer(root)
  const app = new Hono()

  app.get('/api/ping', async (c) => c.json(await analyzer.request<PingResult>({ type: 'ping' })))

  // serveStatic resolve `root` a partir do cwd
  const webDir = path.relative(process.cwd(), fileURLToPath(new URL('./web', import.meta.url))) || '.'
  app.use('*', serveStatic({ root: webDir }))

  const listen = (p: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = serve({ fetch: app.fetch, port: p, hostname: '127.0.0.1' }, (info) => resolve(info.port))
      server.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE' && p < port + MAX_PORT_TRIES - 1) resolve(listen(p + 1))
        else reject(e)
      })
    })

  return listen(port)
}
