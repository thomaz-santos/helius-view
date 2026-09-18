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
  if (source[i] === '(') return 'import-dynamic'

  const lineStart = source.lastIndexOf('\n', quotePos) + 1
  const stmt = source.slice(lineStart, quotePos)
  if (/\b(import|export)\s+type\b/.test(stmt)) return 'import-type'
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
