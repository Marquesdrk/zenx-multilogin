import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertInside, profileRootDir, resolveDataRoot } from '../src/main/paths'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { SettingsService } from '../src/main/services/SettingsService'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { createTestEnv, profileInput, type TestEnv } from './helpers'

let env: TestEnv
beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(async () => {
  await env.dispose()
})

describe('banco de dados', () => {
  it('cria o arquivo SQLite automaticamente no primeiro uso', async () => {
    expect(existsSync(env.paths.databaseFile)).toBe(true)
    const tables = env.database.raw.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
    const names = tables.all().map((r) => String(r.name))
    for (const table of ['profiles', 'groups', 'tags', 'profile_tags', 'profile_events', 'app_settings']) {
      expect(names).toContain(table)
    }
  })

  it('reabre o banco existente preservando os dados', async () => {
    const created = await env.profiles.create(profileInput())
    env.database.close()
    env.database = await DatabaseService.open(env.paths.databaseFile, env.paths.migrationsDir)
    const rows = env.database.raw.prepare("SELECT id FROM profiles").all()
    expect(rows.map((r) => r.id)).toEqual([created.id])
  })

  it('usa %LOCALAPPDATA%/ZenxMultiLogin como raiz de dados', () => {
    const local = join('C:', 'Users', 'x', 'AppData', 'Local')
    expect(resolveDataRoot({ LOCALAPPDATA: local })).toBe(join(local, 'ZenxMultiLogin'))
  })
})

describe('ProfileManager', () => {
  it('cria um perfil com UUID e diretório exclusivo, visível imediatamente na listagem', async () => {
    const profile = await env.profiles.create(
      profileInput({ username: 'conta_a', tags: ['Memes', 'memes', 'Futebol'] })
    )
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(existsSync(env.profiles.userDataDir(profile.id))).toBe(true)
    expect(env.profiles.userDataDir(profile.id)).toBe(
      join(env.paths.profilesRoot, profile.id, 'user-data')
    )
    const list = await env.profiles.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Instagram 01')
    expect(list[0]?.tags.map((t) => t.name)).toEqual(['Futebol', 'memes'])
  })

  it('permite várias plataformas por perfil, preservando a ordem (a primeira é a principal)', async () => {
    const profile = await env.profiles.create(profileInput({ platforms: ['tiktok', 'instagram', 'youtube'] }))
    expect(profile.platforms).toEqual(['tiktok', 'instagram', 'youtube'])
    expect((await env.profiles.list())[0]?.platforms).toEqual(['tiktok', 'instagram', 'youtube'])

    const updated = await env.profiles.update(profile.id, profileInput({ platforms: ['youtube', 'x'] }))
    expect(updated.platforms).toEqual(['youtube', 'x'])
    expect((await env.profiles.duplicate(profile.id)).platforms).toEqual(['youtube', 'x'])

    await expect(env.profiles.create(profileInput({ platforms: [] }))).rejects.toThrow()
    await expect(env.profiles.create(profileInput({ platforms: ['x', 'x'] }))).rejects.toThrow()
  })

  it('a migração mantém a plataforma de perfis criados em versões anteriores', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    env.database.raw
      .prepare(
        "INSERT INTO profiles (id, name, platform, notes, data_dir, created_at, updated_at) VALUES (?, 'Antigo', 'facebook', '', ?, 1, 1)"
      )
      .run(id, `profiles/${id}/user-data`)
    // Simula um perfil da versão 1.0 (sem linhas em profile_platforms).
    env.database.raw.prepare('DELETE FROM profile_platforms WHERE profile_id = ?').run(id)
    expect((await env.profiles.require(id)).platforms).toEqual(['facebook'])
  })

  it('nunca compartilha o diretório de navegador entre dois perfis', async () => {
    const a = await env.profiles.create(profileInput({ name: 'A' }))
    const b = await env.profiles.create(profileInput({ name: 'B' }))
    expect(env.profiles.userDataDir(a.id)).not.toBe(env.profiles.userDataDir(b.id))
  })

  it('rejeita URLs que não sejam HTTPS e nomes vazios', async () => {
    await expect(env.profiles.create(profileInput({ homeUrl: 'http://example.com' }))).rejects.toThrow()
    await expect(env.profiles.create(profileInput({ homeUrl: 'file:///C:/x' }))).rejects.toThrow()
    await expect(env.profiles.create(profileInput({ homeUrl: 'javascript:alert(1)' }))).rejects.toThrow()
    await expect(env.profiles.create(profileInput({ name: '   ' }))).rejects.toThrow()
    expect(await env.profiles.list()).toHaveLength(0)
  })

  it('duplica apenas o cadastro, com diretório novo e vazio', async () => {
    const source = await env.profiles.create(profileInput({ tags: ['Clientes'], notes: 'obs' }))
    await writeFile(join(env.profiles.userDataDir(source.id), 'Cookies'), 'dados-de-sessao')
    const copy = await env.profiles.duplicate(source.id)
    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe('Instagram 01 (cópia)')
    expect(copy.tags.map((t) => t.name)).toEqual(['Clientes'])
    expect(copy.lastOpenedAt).toBeNull()
    expect(existsSync(join(env.profiles.userDataDir(copy.id), 'Cookies'))).toBe(false)
  })

  it('excluir um perfil não afeta os diretórios dos outros', async () => {
    const a = await env.profiles.create(profileInput({ name: 'A' }))
    const b = await env.profiles.create(profileInput({ name: 'B' }))
    await writeFile(join(env.profiles.userDataDir(a.id), 'marker.txt'), 'a')
    await writeFile(join(env.profiles.userDataDir(b.id), 'marker.txt'), 'b')
    await env.profiles.delete(a.id)
    expect(existsSync(profileRootDir(env.paths, a.id))).toBe(false)
    expect(existsSync(join(env.profiles.userDataDir(b.id), 'marker.txt'))).toBe(true)
    expect((await env.profiles.list()).map((p) => p.id)).toEqual([b.id])
  })

  it('bloqueia identificadores que tentam escapar do diretório de perfis', async () => {
    await mkdir(env.paths.profilesRoot, { recursive: true })
    expect(() => env.profiles.userDataDir('..\\..\\Windows')).toThrow()
    expect(() => env.profiles.userDataDir('../outro')).toThrow()
    await expect(env.profiles.delete('../../x')).rejects.toThrow()
    expect(() => assertInside(env.paths.profilesRoot, join(env.paths.profilesRoot, '..', 'x'))).toThrow()
    expect(() => assertInside(env.paths.profilesRoot, env.paths.profilesRoot)).toThrow()
  })

  it('registra eventos sem dados sensíveis', async () => {
    const p = await env.profiles.create(profileInput({ username: 'usuario' }))
    await env.profiles.delete(p.id)
    const events = await env.events.list(10)
    expect(events.map((e) => e.eventType)).toEqual(['profile_deleted', 'profile_created'])
    expect(events.every((e) => !/cookie|token|senha|password/i.test(e.message))).toBe(true)
  })
})

describe('GroupManager', () => {
  it('excluir um grupo mantém os perfis associados', async () => {
    const group = await env.groups.create({ name: 'Futebol', color: '#043EE6' })
    const profile = await env.profiles.create(profileInput({ groupId: group.id }))
    expect((await env.groups.list())[0]?.profileCount).toBe(1)
    await env.groups.delete(group.id)
    expect(await env.groups.list()).toHaveLength(0)
    const after = await env.profiles.require(profile.id)
    expect(after.groupId).toBeNull()
  })

  it('edita nome e cor', async () => {
    const group = await env.groups.create({ name: 'Memes', color: '#043EE6' })
    const updated = await env.groups.update(group.id, { name: 'Doramas', color: '#527CFF' })
    expect(updated).toMatchObject({ name: 'Doramas', color: '#527CFF' })
    await expect(env.groups.create({ name: 'x', color: 'azul' })).rejects.toThrow()
  })
})

describe('SettingsService', () => {
  it('retorna padrões e persiste alterações', async () => {
    expect(await env.settings.get()).toEqual(DEFAULT_SETTINGS)
    await env.settings.update({ maxConcurrentBrowsers: 4, startMaximized: true })
    const fresh = new SettingsService(env.database.db)
    expect(await fresh.get()).toMatchObject({ maxConcurrentBrowsers: 4, startMaximized: true })
    await expect(env.settings.update({ maxConcurrentBrowsers: 0 })).rejects.toThrow()
  })
})
