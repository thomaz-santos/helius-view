// Árvore de pastas a partir dos ids dos nós `file` (caminho relativo com '/', decisão 10).
// Sem React: só estrutura de dados e funções puras, testadas em test/web/tree.test.ts.

export interface FolderEntry {
  type: 'folder'
  path: string
  name: string
  children: TreeEntry[]
}

export interface FileEntry {
  type: 'file'
  path: string
  name: string
}

export type TreeEntry = FolderEntry | FileEntry

export function buildTree(fileIds: string[]): FolderEntry {
  const root: FolderEntry = { type: 'folder', path: '', name: '', children: [] }
  const folders = new Map<string, FolderEntry>([['', root]])

  const folderAt = (path: string): FolderEntry => {
    const existing = folders.get(path)
    if (existing) return existing
    const slash = path.lastIndexOf('/')
    const parentPath = slash === -1 ? '' : path.slice(0, slash)
    const name = slash === -1 ? path : path.slice(slash + 1)
    const parent = folderAt(parentPath)
    const folder: FolderEntry = { type: 'folder', path, name, children: [] }
    parent.children.push(folder)
    folders.set(path, folder)
    return folder
  }

  for (const id of [...fileIds].sort()) {
    const slash = id.lastIndexOf('/')
    const parentPath = slash === -1 ? '' : id.slice(0, slash)
    const name = slash === -1 ? id : id.slice(slash + 1)
    folderAt(parentPath).children.push({ type: 'file', path: id, name })
  }

  for (const folder of folders.values()) {
    folder.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))
  }

  return root
}

// ancestrais de `path` (arquivo ou pasta), da raiz até o pai direto — sem incluir o próprio path
export function ancestorFolders(path: string): string[] {
  const parts = path.split('/')
  parts.pop()
  const result: string[] = []
  let acc = ''
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part
    result.push(acc)
  }
  return result
}

// visível se nem `path` nem nenhum ancestral estiver no conjunto de pastas desmarcadas
export function isPathVisible(path: string, uncheckedFolders: ReadonlySet<string>): boolean {
  if (uncheckedFolders.has(path)) return false
  return ancestorFolders(path).every((a) => !uncheckedFolders.has(a))
}

// desmarcar: adiciona `path` (removendo descendentes redundantes). marcar: remove `path` e descendentes.
export function toggleFolder(uncheckedFolders: ReadonlySet<string>, path: string, checked: boolean): Set<string> {
  const isSelfOrDescendant = (p: string) => p === path || p.startsWith(path + '/')
  const next = new Set([...uncheckedFolders].filter((p) => !isSelfOrDescendant(p)))
  if (!checked) next.add(path)
  return next
}

export function topFolder(fileId: string): string {
  const slash = fileId.indexOf('/')
  return slash === -1 ? '(raiz)' : fileId.slice(0, slash)
}

const PALETTE = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c', '#84cc16', '#e879f9']

export function folderColorMap(fileIds: string[]): Map<string, string> {
  const folders = [...new Set(fileIds.map(topFolder))].sort()
  const map = new Map<string, string>()
  folders.forEach((f, i) => map.set(f, PALETTE[i % PALETTE.length]!))
  return map
}
