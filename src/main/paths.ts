import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { AppError } from '@shared/errors'

export interface AppPaths {
  /** %LOCALAPPDATA%\ZenxMultiLogin */
  root: string
  databaseDir: string
  databaseFile: string
  profilesRoot: string
  migrationsDir: string
  chromiumRoot: string
}

/** Raiz de dados do usuário. Nunca fica na pasta do executável. */
export function resolveDataRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ZENX_DATA_DIR) return resolve(env.ZENX_DATA_DIR)
  const localAppData = env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return join(localAppData, 'ZenxMultiLogin')
}

export function buildPaths(root: string, migrationsDir: string, chromiumRoot: string): AppPaths {
  const databaseDir = join(root, 'database')
  return {
    root,
    databaseDir,
    databaseFile: join(databaseDir, 'zenx.db'),
    profilesRoot: join(root, 'profiles'),
    migrationsDir,
    chromiumRoot
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertUuid(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new AppError('VALIDATION', 'Identificador de perfil inválido.')
  }
}

/** Garante que `target` está estritamente dentro de `parent`. */
export function assertInside(parent: string, target: string): void {
  const rel = relative(resolve(parent), resolve(target))
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new AppError('FORBIDDEN', 'Caminho fora do diretório permitido.')
  }
}

/** profiles/<uuid> — pasta raiz exclusiva do perfil. */
export function profileRootDir(paths: AppPaths, id: string): string {
  assertUuid(id)
  const dir = join(paths.profilesRoot, id.toLowerCase())
  assertInside(paths.profilesRoot, dir)
  return dir
}

/** profiles/<uuid>/user-data — diretório exclusivo do Chromium deste perfil. */
export function profileUserDataDir(paths: AppPaths, id: string): string {
  return join(profileRootDir(paths, id), 'user-data')
}

export function relativeDataDir(id: string): string {
  assertUuid(id)
  return `profiles/${id.toLowerCase()}/user-data`
}
