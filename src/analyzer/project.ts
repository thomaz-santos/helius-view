import fs from 'node:fs'
import { Project, type SourceFile } from 'ts-morph'
import { nearestTsconfig, type TsConfigInfo } from './discover'
import { DEFAULT_OPTIONS } from './imports'

// um Project do ts-morph por tsconfig (decisão 13: carregamento preguiçoso). Cada Project
// só entende as compilerOptions de UM tsconfig, então arquivos de tsconfigs diferentes
// (monorepo) precisam de instâncias separadas — reaproveita o nearestTsconfig do nível 1.
const projects = new Map<string, Project>()

function projectFor(key: string, options: TsConfigInfo['options']): Project {
  let project = projects.get(key)
  if (!project) {
    project = new Project({ compilerOptions: options, skipAddingFilesFromTsConfig: true })
    projects.set(key, project)
  }
  return project
}

// adiciona `absPath` ao Project certo (pelo tsconfig mais próximo), sem duplicar se já
// tiver sido carregado antes.
export function ensureFile(absPath: string, tsconfigs: TsConfigInfo[]): SourceFile | undefined {
  if (!fs.existsSync(absPath)) return undefined
  const lookup = nearestTsconfig(absPath, tsconfigs)
  const [key, options] = lookup.status === 'included' ? [lookup.config.dir, lookup.config.options] : ['', DEFAULT_OPTIONS]
  const project = projectFor(key, options)
  const posixPath = absPath.replace(/\\/g, '/')
  return project.getSourceFile(posixPath) ?? project.addSourceFileAtPath(absPath)
}

// atualização ao vivo (etapa 5): recarrega `absPath` do disco no Project em que já estiver
// carregado, sem trocar a instância do SourceFile (o cache de símbolos guarda o nó do ts-morph
// direto, então só refreshFromFileSystem preserva referências válidas). Não faz nada se o
// arquivo nunca foi carregado — o próximo ensureFile o carrega já atualizado.
export function refreshFile(absPath: string): void {
  const posixPath = absPath.replace(/\\/g, '/')
  for (const project of projects.values()) {
    const sf = project.getSourceFile(posixPath)
    if (sf) {
      sf.refreshFromFileSystemSync()
      return
    }
  }
}

// arquivo apagado: remove do Project em que estiver carregado, se algum.
export function removeFile(absPath: string): void {
  const posixPath = absPath.replace(/\\/g, '/')
  for (const project of projects.values()) {
    const sf = project.getSourceFile(posixPath)
    if (sf) project.removeSourceFile(sf)
  }
}

// tsconfig.json mudou: as compilerOptions cacheadas por Project podem estar erradas: descarta
// tudo, o próximo ensureFile recria com as opções atuais (reanálise completa, etapa 5).
export function resetProjects(): void {
  projects.clear()
}
