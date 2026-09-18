import path from 'node:path'
import { Node, type ParameterDeclaration, type Type } from 'ts-morph'
import { ensureFile } from './project'
import type { TsConfigInfo } from './discover'
import { analyzeCalls, toId, topLevelSymbolsOf, type SymbolEntry } from './symbols'
import type { CallerRef, CallSite, SymbolDetail } from '../shared/symbol'

// findReferences é a parte mais cara de montar o painel; cacheia por id até algum arquivo
// envolvido mudar. A invalidação de verdade (via chokidar) é da etapa 5 — aqui só deixa a
// estrutura fácil de limpar por arquivo: cacheFiles[id] são os arquivos cuja mudança
// invalida a entrada (o do próprio símbolo + os de cada referência encontrada).
const calledByCache = new Map<string, CallerRef[]>()
const cacheFiles = new Map<string, Set<string>>()

export function invalidateCalledByCache(changedFile: string): void {
  for (const [id, files] of cacheFiles) {
    if (files.has(changedFile)) {
      calledByCache.delete(id)
      cacheFiles.delete(id)
    }
  }
}

// reanálise completa (tsconfig.json/.gitignore mudou, etapa 5): descarta tudo de uma vez em
// vez de recalcular quais arquivos cada entrada tocava.
export function clearCalledByCache(): void {
  calledByCache.clear()
  cacheFiles.clear()
}

function findSymbolReferences(node: Node) {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isVariableDeclaration(node)
  ) {
    return node.findReferences()
  }
  return []
}

function isImportOrExportSpecifierRef(node: Node): boolean {
  const parent = node.getParent()
  return !!parent && (Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isExportSpecifier(parent) || Node.isNamespaceImport(parent))
}

function calledByOf(root: string, id: string, node: Node): CallerRef[] {
  const cached = calledByCache.get(id)
  if (cached) return cached

  const result: CallerRef[] = []
  const files = new Set<string>([toId(root, node.getSourceFile().getFilePath())])
  for (const refSymbol of findSymbolReferences(node)) {
    for (const ref of refSymbol.getReferences()) {
      const refNode = ref.getNode()
      const file = toId(root, ref.getSourceFile().getFilePath())
      files.add(file)
      if (ref.isDefinition() || isImportOrExportSpecifierRef(refNode)) continue
      result.push({ file, line: refNode.getStartLineNumber() })
    }
  }
  calledByCache.set(id, result)
  cacheFiles.set(id, files)
  return result
}

interface FunctionShape {
  params: ParameterDeclaration[]
  returnType: Type
  isAsync: boolean
  body: Node | undefined
}

function functionShapeOf(node: Node): FunctionShape | undefined {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
    return { params: node.getParameters(), returnType: node.getReturnType(), isAsync: node.isAsync(), body: node.getBody() }
  }
  if (Node.isGetAccessorDeclaration(node)) {
    return { params: [], returnType: node.getReturnType(), isAsync: false, body: node.getBody() }
  }
  if (Node.isSetAccessorDeclaration(node)) {
    return { params: node.getParameters(), returnType: node.getReturnType(), isAsync: false, body: node.getBody() }
  }
  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer()
    if (init && Node.isArrowFunction(init)) {
      return { params: init.getParameters(), returnType: init.getReturnType(), isAsync: init.isAsync(), body: init.getBody() }
    }
    if (init && Node.isFunctionExpression(init)) {
      return { params: init.getParameters(), returnType: init.getReturnType(), isAsync: init.isAsync(), body: init.getBody() }
    }
  }
  return undefined
}

// o checker imprime tipo de outro módulo como import("/caminho/absoluto").Nome quando não
// tem um alias curto à mão; fica ilegível no painel, então só mantém o nome.
function cleanTypeText(text: string): string {
  return text.replace(/import\("[^"]*"\)\./g, '')
}

// tipos complexos (objeto com várias propriedades) expandidos um nível, senão o texto do
// tipo já resolvido (decisão 5).
function expandTypeOneLevel(type: Type): string {
  const text = cleanTypeText(type.getText())
  if (text.length <= 60) return text
  const props = type.getProperties()
  if (props.length === 0 || props.length > 15) return text
  const parts = props.map((p) => {
    const decl = p.getValueDeclaration()
    return `${p.getName()}: ${decl ? cleanTypeText(decl.getType().getText()) : '?'}`
  })
  return `{ ${parts.join('; ')} }`
}

// nó com o código-fonte a mostrar no bloco de processamento: pra const com arrow function
// usa a declaração da variável inteira (tem o "const nome ="), não só a arrow function.
function displayNode(entry: SymbolEntry): Node {
  if (Node.isVariableDeclaration(entry.node)) {
    const stmt = entry.node.getVariableStatement()
    if (stmt) return stmt
  }
  return entry.node
}

export function buildSymbolDetail(
  symbolIdParam: string,
  root: string,
  tsconfigs: TsConfigInfo[],
  discovered: ReadonlySet<string>,
): SymbolDetail | undefined {
  const hash = symbolIdParam.indexOf('#')
  if (hash === -1) return undefined
  const relFile = symbolIdParam.slice(0, hash)
  const qualifiedName = symbolIdParam.slice(hash + 1)
  const absFile = path.resolve(root, relFile)

  const sf = ensureFile(absFile, tsconfigs)
  if (!sf) return undefined
  const entry = topLevelSymbolsOf(sf).find((e) => e.qualifiedName === qualifiedName)
  if (!entry) return undefined

  const shape = functionShapeOf(entry.node)

  const params = (shape?.params ?? []).map((p) => ({
    name: p.getName(),
    type: expandTypeOneLevel(p.getType()),
    optional: p.isOptional(),
    default: p.getInitializer()?.getText(),
  }))

  const throwsSet = new Set<string>()
  if (shape?.body) {
    shape.body.forEachDescendant((n) => {
      if (Node.isThrowStatement(n)) {
        const expr = n.getExpression()
        throwsSet.add(expr ? expandTypeOneLevel(expr.getType()) : 'unknown')
      }
    })
  }

  const returnTypeText = cleanTypeText(shape ? shape.returnType.getText() : entry.node.getType().getText())

  const calls: CallSite[] = []
  const external: CallSite[] = []
  const unresolved: { label: string; line: number }[] = []
  const callRanges: { start: number; end: number; targetId: string }[] = []

  const disp = displayNode(entry)
  const code = disp.getText()
  if (shape?.body) {
    for (const found of analyzeCalls(shape.body, root, discovered, tsconfigs)) {
      const offset = disp.getStart() === entry.node.getStart() ? 0 : entry.node.getStart() - disp.getStart()
      if (found.bucket === 'unresolved') {
        unresolved.push({ label: found.label, line: found.line })
      } else if (found.bucket === 'external') {
        external.push({ label: found.label, line: found.line })
      } else if (found.targetId) {
        if (found.edgeKind !== 'reference') calls.push({ targetId: found.targetId, label: found.label, line: found.line })
        if (found.edgeKind === 'call' || found.edgeKind === 'call-possible') {
          callRanges.push({ start: found.start + offset, end: found.end + offset, targetId: found.targetId })
        }
      }
    }
  }

  const editorUrl = `vscode://file/${absFile.replace(/\\/g, '/')}:${entry.node.getStartLineNumber()}`

  return {
    id: symbolIdParam,
    name: entry.qualifiedName,
    kind: entry.kind,
    file: relFile,
    line: entry.node.getStartLineNumber(),
    input: { params },
    output: { type: returnTypeText, async: shape?.isAsync ?? false, promise: returnTypeText.startsWith('Promise<'), throws: [...throwsSet] },
    processing: { code, startLine: disp.getStartLineNumber(), calls: callRanges },
    calls: { project: calls, external, unresolved },
    calledBy: calledByOf(root, symbolIdParam, entry.node),
    editorUrl,
  }
}
