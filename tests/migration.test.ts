/**
 * Garante que um banco criado pela versão 1.0 (somente a migração inicial)
 * é atualizado sem perda de dados, preenchendo as plataformas existentes.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { buildPaths } from '../src/main/paths'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { EventLogger } from '../src/main/services/EventLogger'
import { ProfileManager } from '../src/main/services/ProfileManager'
import { CHROMIUM_ROOT, MIGRATIONS_DIR } from './helpers'

let root: string
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
})

it('atualiza um banco da versão 1.0 preservando perfis e plataformas', async () => {
  root = await mkdtemp(join(tmpdir(), 'zenx-mig-'))
  const paths = buildPaths(root, MIGRATIONS_DIR, CHROMIUM_ROOT)

  // Banco "antigo": aplica apenas a migração 0000 manualmente.
  const { mkdirSync } = await import('node:fs')
  mkdirSync(paths.databaseDir, { recursive: true })
  const old = new DatabaseSync(paths.databaseFile)
  const initSql = await readFile(join(MIGRATIONS_DIR, '0000_init.sql'), 'utf8')
  for (const statement of initSql.split('--> statement-breakpoint')) old.exec(statement)
  const id = '22222222-2222-4222-8222-222222222222'
  old
    .prepare(
      "INSERT INTO profiles (id, name, platform, notes, data_dir, created_at, updated_at) VALUES (?, 'TikTok 01', 'tiktok', '', ?, 1, 1)"
    )
    .run(id, `profiles/${id}/user-data`)
  // Registra a migração 0000 como aplicada, como o Drizzle faria.
  const journal = JSON.parse(await readFile(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number }[]
  }
  const { createHash } = await import('node:crypto')
  old.exec(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)'
  )
  old
    .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)')
    .run(createHash('sha256').update(initSql).digest('hex'), journal.entries[0]?.when ?? 0)
  old.close()

  const database = await DatabaseService.open(paths.databaseFile, paths.migrationsDir)
  try {
    const profiles = new ProfileManager(database.db, paths, new EventLogger(database.db))
    const list = await profiles.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id, name: 'TikTok 01', platforms: ['tiktok'] })
    const rows = database.raw.prepare('SELECT platform FROM profile_platforms WHERE profile_id = ?').all(id)
    expect(rows).toEqual([{ platform: 'tiktok' }])
  } finally {
    database.close()
  }
})
