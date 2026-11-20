import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildPaths, type AppPaths } from '../src/main/paths'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { EventLogger } from '../src/main/services/EventLogger'
import { GroupManager } from '../src/main/services/GroupManager'
import { ProfileManager } from '../src/main/services/ProfileManager'
import { ProxyManager, type ProxyManagerOptions } from '../src/main/services/ProxyManager'
import type { SecretStore } from '../src/main/proxy/secrets'
import { SettingsService } from '../src/main/services/SettingsService'
import type { ProfileInput } from '../src/shared/schemas'
import { DEFAULT_REGION } from '../src/shared/region'

export const MIGRATIONS_DIR = resolve('drizzle')
export const CHROMIUM_ROOT = resolve('resources/chromium')

export interface TestEnv {
  paths: AppPaths
  database: DatabaseService
  events: EventLogger
  profiles: ProfileManager
  groups: GroupManager
  proxies: ProxyManager
  settings: SettingsService
  dispose(): Promise<void>
}

/** Ambiente isolado em pasta temporária. Dados de demonstração existem só aqui. */
/** Cifra reversível de teste (o Electron usa DPAPI). Nunca grava o texto puro. */
export const testSecrets: SecretStore = {
  encrypt: (plain) => 'test:' + Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (stored) => Buffer.from(stored.slice(5), 'base64').toString('utf8')
}

export async function createTestEnv(proxyOptions: ProxyManagerOptions = {}): Promise<TestEnv> {
  const root = await mkdtemp(join(tmpdir(), 'zenx-test-'))
  const paths = buildPaths(root, MIGRATIONS_DIR, CHROMIUM_ROOT)
  const env: TestEnv = {
    paths,
    database: await DatabaseService.open(paths.databaseFile, paths.migrationsDir),
    events: undefined as never,
    profiles: undefined as never,
    groups: undefined as never,
    proxies: undefined as never,
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
  env.proxies = new ProxyManager(env.database.db, testSecrets, env.events, proxyOptions)
  return env
}

export function profileInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    name: 'Instagram 01',
    platforms: ['instagram'],
    username: '',
    homeUrl: 'https://www.instagram.com/',
    groupId: null,
    proxyId: null,
    region: { ...DEFAULT_REGION },
    tags: [],
    notes: '',
    ...overrides
  }
}
