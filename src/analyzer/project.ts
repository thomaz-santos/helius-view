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
