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

// tsconfig "solution" (files: [], references: [...], padrão do Vite) não tem fileNames
// próprio: os arquivos reais estão nos configs referenciados (tsconfig.app.json etc).
// Eles contam como configs do MESMO diretório do config que os referencia, não do seu
// próprio diretório — por isso `dir` é passado explicitamente na recursão.
function parseTsconfig(configPath: string, dir: string = path.dirname(configPath)): TsConfigInfo[] {
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error) return []
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath))

  const result: TsConfigInfo[] = []
  if (parsed.fileNames.length) {
    result.push({ dir, options: parsed.options, fileNames: new Set(parsed.fileNames.map(normKey)) })
  }
  for (const ref of parsed.projectReferences ?? []) {
    result.push(...parseTsconfig(ts.resolveProjectReferencePath(ref), dir))
  }
  return result
}

export type ConfigLookup =
  | { status: 'included'; config: TsConfigInfo }
  | { status: 'excluded' }
  | { status: 'no-config' }

// tsconfig mais próximo de `file`, entre os descobertos no repo (decisão 9). Um diretório
// pode ter mais de um config (solution style); o arquivo entra se ALGUM deles o incluir.
function nearestTsconfig(file: string, tsconfigs: TsConfigInfo[]): ConfigLookup {
  let nearestDir: string | undefined
  for (const c of tsconfigs) {
    if (file !== c.dir && !file.startsWith(c.dir + path.sep)) continue
    if (nearestDir !== undefined && c.dir !== nearestDir) break // já passou do diretório mais próximo
    nearestDir = c.dir
    if (c.fileNames.has(normKey(file))) return { status: 'included', config: c }
  }
  return nearestDir === undefined ? { status: 'no-config' } : { status: 'excluded' }
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
  const tsconfigs = tsconfigPaths.flatMap((p) => parseTsconfig(p)).sort((a, b) => b.dir.length - a.dir.length)

  const files = candidates.filter((file) => {
    // sem tsconfig cobrindo o arquivo: entra (JS puro). Com tsconfig: só entra se algum
    // config do diretório mais próximo aceitar o arquivo.
    return nearestTsconfig(file, tsconfigs).status !== 'excluded'
  })

  const warning =
    files.length > WARN_FILE_COUNT
      ? `${files.length} arquivos encontrados (acima de ${WARN_FILE_COUNT}); a análise pode demorar`
      : undefined

  return { files, tsconfigs, warning }
}

export { nearestTsconfig }
