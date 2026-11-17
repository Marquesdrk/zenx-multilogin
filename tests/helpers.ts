import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildPaths, type AppPaths } from '../src/main/paths'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { EventLogger } from '../src/main/services/EventLogger'
import { GroupManager } from '../src/main/services/GroupManager'
import { ProfileManager } from '../src/main/services/ProfileManager'
import { SettingsService } from '../src/main/services/SettingsService'
import type { ProfileInput } from '../src/shared/schemas'

export const MIGRATIONS_DIR = resolve('drizzle')
export const CHROMIUM_ROOT = resolve('resources/chromium')

export interface TestEnv {
  paths: AppPaths
  database: DatabaseService
  events: EventLogger
  profiles: ProfileManager
  groups: GroupManager
  settings: SettingsService
  dispose(): Promise<void>
}

/** Ambiente isolado em pasta temporária. Dados de demonstração existem só aqui. */
export async function createTestEnv(): Promise<TestEnv> {
  const root = await mkdtemp(join(tmpdir(), 'zenx-test-'))
  const paths = buildPaths(root, MIGRATIONS_DIR, CHROMIUM_ROOT)
  const env: TestEnv = {
    paths,
    database: await DatabaseService.open(paths.databaseFile, paths.migrationsDir),
    events: undefined as never,
    profiles: undefined as never,
    groups: undefined as never,
    settings: undefined as never,
    async dispose() {
      env.database.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
    }
  }
  env.events = new EventLogger(env.database.db)
  env.profiles = new ProfileManager(env.database.db, paths, env.events)
  env.groups = new GroupManager(env.database.db, env.events)
  env.settings = new SettingsService(env.database.db)
  return env
}

export function profileInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    name: 'Instagram 01',
    platforms: ['instagram'],
    username: '',
    homeUrl: 'https://www.instagram.com/',
    groupId: null,
    tags: [],
    notes: '',
    ...overrides
  }
}
