import path from 'node:path'
import chokidar from 'chokidar'
import { buildIgnore, SKIP_DIRS, SOURCE_EXT } from '../analyzer/discover'
import type { FileChange, FileChangeType } from '../shared/protocol'

const DEBOUNCE_MS = 300

function isWatchedPath(rel: string): boolean {
  const base = path.basename(rel)
  if (base === 'tsconfig.json' || base === '.gitignore') return true
  return SOURCE_EXT.has(path.extname(rel))
}

// chokidar na thread principal (decisão 8), mesmo escopo/exclusões da descoberta (decisão
// 3: .gitignore, --exclude, node_modules/dist/build/.git), debounce agrupando add/change/
// unlink numa lista só. Devolve uma função pra parar de observar.
export function watchRoot(root: string, exclude: string[], onChanges: (changes: FileChange[]) => void): () => void {
  const ig = buildIgnore(root, exclude)

  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (p: string) => {
      const rel = path.relative(root, p).split(path.sep).join('/')
      if (!rel) return false
      if (rel.split('/').some((seg) => SKIP_DIRS.has(seg))) return true
      return ig.ignores(rel) || ig.ignores(`${rel}/`)
    },
  })

  const pending = new Map<string, FileChange>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    const changes = [...pending.values()]
    pending.clear()
    if (changes.length) onChanges(changes)
  }

  const record = (type: FileChangeType) => (absPath: string) => {
    const rel = path.relative(root, absPath).split(path.sep).join('/')
    if (!isWatchedPath(rel)) return
    pending.set(rel, { file: rel, type })
    clearTimeout(timer)
    timer = setTimeout(flush, DEBOUNCE_MS)
  }

  watcher.on('add', record('add'))
  watcher.on('change', record('change'))
  watcher.on('unlink', record('unlink'))

  return () => {
    clearTimeout(timer)
    void watcher.close()
  }
}
