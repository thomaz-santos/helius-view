import fs from 'node:fs'
import path from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { ts } from 'ts-morph'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git'])
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
export const WARN_FILE_COUNT = 5000

export interface TsConfigInfo {
  dir: string
  options: ts.CompilerOptions
  fileNames: Set<string>
}

export interface DiscoverResult {
  files: string[]
  tsconfigs: TsConfigInfo[]
  warning?: string
}

const normKey = (p: string) => path.resolve(p).replace(/\\/g, '/').toLowerCase()

function parseTsconfig(configPath: string): TsConfigInfo | undefined {
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error) return undefined
  const dir = path.dirname(configPath)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dir)
  return { dir, options: parsed.options, fileNames: new Set(parsed.fileNames.map(normKey)) }
}

// tsconfig mais próximo de `file`, entre os descobertos no repo (decisão 9)
function nearestTsconfig(file: string, tsconfigs: TsConfigInfo[]): TsConfigInfo | undefined {
  return tsconfigs.find((c) => file === c.dir || file.startsWith(c.dir + path.sep))
}

export function discoverFiles(root: string, excludePatterns: string[]): DiscoverResult {
  const ig: Ignore = ignore()
  const gitignorePath = path.join(root, '.gitignore')
  if (fs.existsSync(gitignorePath)) ig.add(fs.readFileSync(gitignorePath, 'utf8'))
  if (excludePatterns.length) ig.add(excludePatterns)

  const candidates: string[] = []
  const tsconfigPaths: string[] = []

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(root, abs).split(path.sep).join('/')
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (rel && ig.ignores(rel + '/')) continue
        walk(abs)
      } else if (entry.isFile()) {
        if (entry.name === 'tsconfig.json') tsconfigPaths.push(abs)
        if (!SOURCE_EXT.has(path.extname(entry.name))) continue
        if (rel && ig.ignores(rel)) continue
        candidates.push(abs)
      }
    }
  }
  walk(root)

  // mais profundo primeiro, para achar o tsconfig mais próximo de cada arquivo
  const tsconfigs = tsconfigPaths
    .map(parseTsconfig)
    .filter((c): c is TsConfigInfo => c !== undefined)
    .sort((a, b) => b.dir.length - a.dir.length)

  const files = candidates.filter((file) => {
    const config = nearestTsconfig(file, tsconfigs)
    // sem tsconfig cobrindo o arquivo: entra (JS puro). Com tsconfig: só entra se o
    // include/exclude dele aceitar o arquivo.
    return !config || config.fileNames.has(normKey(file))
  })

  const warning =
    files.length > WARN_FILE_COUNT
      ? `${files.length} arquivos encontrados (acima de ${WARN_FILE_COUNT}); a análise pode demorar`
      : undefined

  return { files, tsconfigs, warning }
}

export { nearestTsconfig }
