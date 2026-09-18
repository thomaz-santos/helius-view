import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { startAnalyzer } from './analyzer'
import { watchRoot } from './watch'
import type { PingResult, ProgressEvent } from '../shared/protocol'
import type { Graph } from '../shared/graph'
import type { SearchResult, SymbolDetail } from '../shared/symbol'

const MAX_PORT_TRIES = 10

export async function startServer(root: string, port: number, exclude: string[] = []): Promise<number> {
  const analyzer = startAnalyzer(root, exclude)
  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  // contra DNS rebinding: só aceita Host 127.0.0.1/localhost na porta em que o servidor
  // está de fato escutando (atualizada por listen() se cair pro fallback de porta)
  let actualPort = port
  const isAllowedHost = (host: string | undefined) =>
    host === `127.0.0.1:${actualPort}` || host === `localhost:${actualPort}`

  app.use('*', async (c, next) => {
    if (!isAllowedHost(c.req.header('host'))) return c.text('forbidden', 403)
    return next()
  })

  // navegador sempre manda Origin no handshake do WS; se vier, tem que ser um host permitido
  app.use('/ws', async (c, next) => {
    const origin = c.req.header('origin')
    if (origin) {
      let originHost: string | undefined
      try {
        originHost = new URL(origin).host
      } catch {
        originHost = undefined
      }
      if (!isAllowedHost(originHost)) return c.text('forbidden', 403)
    }
    return next()
  })

  app.get('/api/ping', async (c) => c.json(await analyzer.request<PingResult>({ type: 'ping' })))

  // dispara a análise assim que o servidor sobe; GET /api/graph e /ws reaproveitam a mesma
  const graphPromise = analyzer.request<Graph>({ type: 'graph' })
  app.get('/api/graph', async (c) => c.json(await graphPromise))

  // nível 2, sob demanda (decisão 2). O worker valida caminho/id contra a raiz e o
  // conjunto descoberto (segurança); aqui só convertemos a rejeição em 400.
  app.get('/api/symbols', async (c) => {
    try {
      return c.json(await analyzer.request<Graph>({ type: 'symbols', file: c.req.query('file') ?? '' }))
    } catch (e) {
      return c.json({ error: String(e) }, 400)
    }
  })

  app.get('/api/symbol', async (c) => {
    try {
      const detail = await analyzer.request<SymbolDetail | undefined>({ type: 'symbol', symbolId: c.req.query('id') ?? '' })
      return detail ? c.json(detail) : c.json({ error: 'símbolo não encontrado' }, 404)
    } catch (e) {
      return c.json({ error: String(e) }, 400)
    }
  })

  app.get('/api/search', async (c) =>
    c.json(await analyzer.request<SearchResult[]>({ type: 'search', query: c.req.query('q') ?? '' })),
  )

  // último evento de progresso, pra quem conectar no WS depois da análise já ter avançado
  // (um graph:patch nunca vira lastProgress: é um delta, sem sentido pra quem conecta agora
  // — o front busca /api/graph inteiro na primeira carga)
  let lastProgress: ProgressEvent | undefined
  analyzer.onProgress((e) => {
    if (e.event === 'progress') lastProgress = e
  })

  // atualização ao vivo (decisão 8, etapa 5): observa a raiz e manda os arquivos alterados
  // pra worker, que devolve um graph:patch empurrado pelo mesmo canal de progresso
  watchRoot(root, exclude, (changes) => {
    void analyzer.request({ type: 'filesChanged', changes }).catch((e) => console.error('atualização ao vivo falhou:', e))
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
      const server = serve({ fetch: app.fetch, port: p, hostname: '127.0.0.1' }, (info) => {
        actualPort = info.port
        resolve(info.port)
      })
      injectWebSocket(server)
      server.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE' && p < port + MAX_PORT_TRIES - 1) resolve(listen(p + 1))
        else reject(e)
      })
    })

  return listen(port)
}
