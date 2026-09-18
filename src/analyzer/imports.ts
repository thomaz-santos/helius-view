import { ts } from 'ts-morph'
import type { EdgeKind } from '../shared/graph'

export interface RawImport {
  specifier: string
  kind: EdgeKind
}

export const DEFAULT_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
}

// ts.preProcessFile faz um scan leve (sem parse completo). `pos` de cada import aponta
// para a aspa de abertura do especificador; usamos isso pra classificar dynamic/type
// sem re-parsear o arquivo inteiro.
export function extractImports(source: string): RawImport[] {
  const info = ts.preProcessFile(source, true, true)
  return info.importedFiles.map((ref) => ({ specifier: ref.fileName, kind: classify(source, ref.pos) }))
}

function classify(source: string, quotePos: number): EdgeKind {
  let i = quotePos - 1
  while (i >= 0 && /\s/.test(source[i]!)) i--

  if (source[i] === '(') {
    // dynamic import só conta se o token antes de "(" for "import" — require() também
    // termina em "(especificador)" mas não é dynamic, é um import comum.
    let j = i - 1
    while (j >= 0 && /\s/.test(source[j]!)) j--
    let k = j
    while (k >= 0 && /\w/.test(source[k]!)) k--
    if (source.slice(k + 1, j + 1) === 'import') return 'import-dynamic'
  }

  // procura pra trás a última palavra-chave import/export antes da aspa (não só a linha
  // atual: import type multi-linha do prettier quebra "import type {" e "} from '...'"),
  // mas nunca atravessando uma aspa anterior — ela fecha o especificador de uma
  // declaração import/export-from já terminada (ex.: um require() logo depois de
  // "... from './x'" não pode herdar o "import type" daquela declaração anterior).
  const prevQuote = Math.max(source.lastIndexOf("'", quotePos - 1), source.lastIndexOf('"', quotePos - 1))
  const prefix = source.slice(prevQuote + 1, quotePos)
  const keyword = [...prefix.matchAll(/\b(?:import|export)\b/g)].at(-1)
  if (keyword && /^(?:import|export)\s+type\b/.test(prefix.slice(keyword.index))) return 'import-type'

  return 'import'
}

export function resolveImport(specifier: string, containingFile: string, options: ts.CompilerOptions) {
  return ts.resolveModuleName(specifier, containingFile, options, ts.sys)
}

export function packageNameFromSpecifier(spec: string): string {
  if (spec.startsWith('node:')) return spec
  const parts = spec.split('/')
  if (spec.startsWith('@') && parts.length > 1) return `${parts[0]}/${parts[1]}`
  return parts[0]!
}
