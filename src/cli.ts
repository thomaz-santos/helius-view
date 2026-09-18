#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { startServer } from './server/index'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p', default: '4317' },
    'no-open': { type: 'boolean', default: false },
  },
})

// caminhos sempre com / (Windows incluso)
const root = path.resolve(positionals[0] ?? '.').split(path.sep).join('/')
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`helius: não é um diretório: ${root}`)
  process.exit(1)
}

const wanted = Number(values.port)
if (!Number.isInteger(wanted) || wanted < 1 || wanted > 65535) {
  console.error(`helius: porta inválida: ${values.port}`)
  process.exit(1)
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref()
}

const port = await startServer(root, wanted)
const url = `http://127.0.0.1:${port}`
if (port !== wanted) console.log(`porta ${wanted} ocupada, usando ${port}`)
console.log(`helius: ${root}\n${url}`)
if (!values['no-open']) openBrowser(url)
