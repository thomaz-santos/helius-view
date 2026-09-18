import { ts } from 'ts-morph'

export type SymbolKind = 'function' | 'class' | 'method' | 'variable' | 'type'

export interface DeclInfo {
  name: string
  kind: SymbolKind
  hasBody: boolean
}

// Opera em ts.Node puro (não em nós do ts-morph) pra funcionar tanto na passada sintática
// do índice de nomes (ts.createSourceFile) quanto no /api/symbols (ts-morph, que expõe o
// mesmo ts.Node original em `.compilerNode`) — uma única fonte pras convenções de nome da
// decisão 10: default anônimo vira "default", arrow em const usa o nome da variável,
// get/set ganham sufixo ":get"/":set".
export function topLevelDeclInfo(node: ts.Node): DeclInfo | undefined {
  if (ts.isFunctionDeclaration(node)) {
    return { name: node.name?.text ?? 'default', kind: 'function', hasBody: node.body !== undefined }
  }
  if (ts.isClassDeclaration(node)) {
    return { name: node.name?.text ?? 'default', kind: 'class', hasBody: true }
  }
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    return { name: node.name.text, kind: 'type', hasBody: true }
  }
  if (ts.isVariableStatement(node)) {
    const decl = node.declarationList.declarations[0]
    if (!decl || !ts.isIdentifier(decl.name)) return undefined
    const init = decl.initializer
    const isFn = init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
    return { name: decl.name.text, kind: isFn ? 'function' : 'variable', hasBody: true }
  }
  return undefined
}

// membro de classe que vira nó (método, get/set); construtor e propriedades simples não.
export function classMemberInfo(node: ts.Node): DeclInfo | undefined {
  if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
    return { name: node.name.text, kind: 'method', hasBody: node.body !== undefined }
  }
  if (ts.isGetAccessorDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
    return { name: `${node.name.text}:get`, kind: 'method', hasBody: true }
  }
  if (ts.isSetAccessorDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
    return { name: `${node.name.text}:set`, kind: 'method', hasBody: true }
  }
  return undefined
}

export function symbolId(file: string, qualifiedName: string): string {
  return `${file}#${qualifiedName}`
}
