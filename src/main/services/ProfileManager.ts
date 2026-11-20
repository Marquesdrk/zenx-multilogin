import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { AppError } from '@shared/errors'
import { profileInputSchema, type ProfileInput } from '@shared/schemas'
import { GROUP_COLORS, PLATFORMS, type Platform, type ProfileDTO, type TagDTO } from '@shared/types'
import { REGION_MODES, type RegionMode, type RegionSettings } from '@shared/region'
import { groups, profilePlatforms, profiles, profileTags, proxies, tags } from '../db/schema'
import {
  assertInside,
  assertUuid,
  profileRootDir,
  profileUserDataDir,
  relativeDataDir,
  type AppPaths
} from '../paths'
import type { Db } from './DatabaseService'
import type { EventLogger } from './EventLogger'

type ProfileRow = typeof profiles.$inferSelect

export class ProfileManager {
  constructor(
    private readonly db: Db,
    private readonly paths: AppPaths,
    private readonly events: EventLogger
  ) {}

  async list(): Promise<ProfileDTO[]> {
    const rows = await this.db.select().from(profiles).orderBy(desc(profiles.createdAt))
    const links = await this.db
      .select({ profileId: profileTags.profileId, id: tags.id, name: tags.name, color: tags.color })
      .from(profileTags)
      .innerJoin(tags, eq(tags.id, profileTags.tagId))
    const byProfile = new Map<string, TagDTO[]>()
    for (const { profileId, ...tag } of links) {
      const list = byProfile.get(profileId) ?? []
      list.push(tag)
      byProfile.set(profileId, list)
    }
    const platformRows = await this.db
      .select()
      .from(profilePlatforms)
      .orderBy(asc(profilePlatforms.position))
    const platformsByProfile = new Map<string, Platform[]>()
    for (const row of platformRows) {
      const list = platformsByProfile.get(row.profileId) ?? []
      list.push(row.platform as Platform)
      platformsByProfile.set(row.profileId, list)
    }
    return rows.map((row) => this.toDTO(row, byProfile.get(row.id) ?? [], platformsByProfile.get(row.id)))
  }

  async get(id: string): Promise<ProfileDTO | null> {
    assertUuid(id)
    const [row] = await this.db.select().from(profiles).where(eq(profiles.id, id))
    if (!row) return null
    const rowTags = await this.db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(profileTags)
      .innerJoin(tags, eq(tags.id, profileTags.tagId))
      .where(eq(profileTags.profileId, id))
    const rowPlatforms = await this.db
      .select({ platform: profilePlatforms.platform })
      .from(profilePlatforms)
      .where(eq(profilePlatforms.profileId, id))
      .orderBy(asc(profilePlatforms.position))
    return this.toDTO(
      row,
      rowTags,
      rowPlatforms.map((r) => r.platform as Platform)
    )
  }

  async require(id: string): Promise<ProfileDTO> {
    const profile = await this.get(id)
    if (!profile) throw new AppError('NOT_FOUND', 'Perfil não encontrado.')
    return profile
  }

  async create(input: ProfileInput): Promise<ProfileDTO> {
    const data = await this.validate(input)
    const profile = await this.insert(data)
    await this.events.log('profile_created', `Perfil "${profile.name}" criado`, profile.id)
    return profile
  }

  async update(id: string, input: ProfileInput): Promise<ProfileDTO> {
    await this.require(id)
    const data = await this.validate(input)
    await this.db
      .update(profiles)
      .set({
        name: data.name,
        platform: data.platforms[0] as Platform,
        username: data.username || null,
        homeUrl: data.homeUrl || null,
        groupId: data.groupId,
        proxyId: data.proxyId,
        ...regionColumns(data.region),
        notes: data.notes,
        updatedAt: Date.now()
      })
      .where(eq(profiles.id, id))
    await this.setPlatforms(id, data.platforms)
    await this.setTags(id, data.tags)
    await this.events.log('profile_updated', `Perfil "${data.name}" atualizado`, id)
    return this.require(id)
  }

  /**
   * Duplica somente o cadastro. O novo perfil recebe um diretório de navegador
   * novo e vazio: cookies, tokens e sessões não são copiados.
   */
  async duplicate(id: string): Promise<ProfileDTO> {
    const source = await this.require(id)
    const copy = await this.insert({
      name: `${source.name} (cópia)`.slice(0, 80),
      platforms: source.platforms,
      username: source.username ?? '',
      homeUrl: source.homeUrl ?? '',
      groupId: source.groupId,
      proxyId: source.proxyId,
      region: source.region,
      tags: source.tags.map((t) => t.name),
      notes: source.notes
    })
    await this.events.log('profile_duplicated', `Perfil "${source.name}" duplicado`, copy.id)
    return copy
  }

  /** Exclui o cadastro e somente a pasta exclusiva deste perfil. */
  async delete(id: string): Promise<void> {
    const profile = await this.require(id)
    const dir = profileRootDir(this.paths, id)
    assertInside(this.paths.profilesRoot, dir)
    await this.db.delete(profiles).where(eq(profiles.id, id))
    await this.pruneOrphanTags()
    await this.events.log('profile_deleted', `Perfil "${profile.name}" excluído`)
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
    } catch {
      throw new AppError(
        'INTERNAL',
        'O perfil foi removido, mas parte dos arquivos do navegador ainda está em uso e não pôde ser apagada.'
      )
    }
  }

  async markOpened(id: string): Promise<void> {
    assertUuid(id)
    await this.db.update(profiles).set({ lastOpenedAt: Date.now() }).where(eq(profiles.id, id))
  }

  /** Diretório absoluto e exclusivo do Chromium deste perfil. */
  userDataDir(id: string): string {
    return profileUserDataDir(this.paths, id)
  }

  async listTags(): Promise<TagDTO[]> {
    return this.db.select().from(tags).orderBy(tags.name)
  }

  private async validate(input: ProfileInput): Promise<ProfileInput> {
    const data = profileInputSchema.parse(input)
    if (data.groupId) {
      const [group] = await this.db.select({ id: groups.id }).from(groups).where(eq(groups.id, data.groupId))
      if (!group) throw new AppError('VALIDATION', 'O grupo selecionado não existe mais.')
    }
    if (data.proxyId) {
      const [proxy] = await this.db.select({ id: proxies.id }).from(proxies).where(eq(proxies.id, data.proxyId))
      if (!proxy) throw new AppError('VALIDATION', 'O proxy selecionado não existe mais.')
    }
    return data
  }

  private async insert(data: ProfileInput): Promise<ProfileDTO> {
    const id = randomUUID()
    const now = Date.now()
    await mkdir(this.userDataDir(id), { recursive: true })
    await this.db.insert(profiles).values({
      id,
      name: data.name,
      platform: data.platforms[0] as Platform,
      username: data.username || null,
      homeUrl: data.homeUrl || null,
      groupId: data.groupId,
      proxyId: data.proxyId,
      ...regionColumns(data.region),
      notes: data.notes,
      dataDir: relativeDataDir(id),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null
    })
    await this.setPlatforms(id, data.platforms)
    await this.setTags(id, data.tags)
    return this.require(id)
  }

  private async setPlatforms(profileId: string, platforms: readonly Platform[]): Promise<void> {
    await this.db.delete(profilePlatforms).where(eq(profilePlatforms.profileId, profileId))
    await this.db
      .insert(profilePlatforms)
      .values(platforms.map((platform, position) => ({ profileId, platform, position })))
  }

  private async setTags(profileId: string, names: string[]): Promise<void> {
    const unique = new Map<string, string>()
    for (const name of names) {
      const trimmed = name.trim()
      if (trimmed) unique.set(trimmed.toLowerCase(), trimmed)
    }
    await this.db.delete(profileTags).where(eq(profileTags.profileId, profileId))
    if (unique.size > 0) {
      const keys = [...unique.keys()]
      const existing = await this.db
        .select()
        .from(tags)
        .where(inArray(sql`lower(${tags.name})`, keys))
      const idByKey = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]))
      let colorIndex = existing.length
      for (const [key, name] of unique) {
        if (idByKey.has(key)) continue
        const tagId = randomUUID()
        const color = GROUP_COLORS[colorIndex++ % GROUP_COLORS.length] ?? GROUP_COLORS[0]
        await this.db.insert(tags).values({ id: tagId, name, color })
        idByKey.set(key, tagId)
      }
      await this.db
        .insert(profileTags)
        .values(keys.map((key) => ({ profileId, tagId: idByKey.get(key) as string })))
    }
    await this.pruneOrphanTags()
  }

  private async pruneOrphanTags(): Promise<void> {
    await this.db
      .delete(tags)
      .where(notInArray(tags.id, this.db.select({ id: profileTags.tagId }).from(profileTags)))
  }

  private toDTO(row: ProfileRow, rowTags: TagDTO[], rowPlatforms: Platform[] = []): ProfileDTO {
    const known = rowPlatforms.filter((p) => PLATFORMS.includes(p))
    return {
      id: row.id,
      name: row.name,
      platforms: known.length > 0 ? known : [row.platform as Platform],
      username: row.username,
      homeUrl: row.homeUrl,
      groupId: row.groupId,
      proxyId: row.proxyId,
      region: regionFromRow(row),
      notes: row.notes,
      tags: [...rowTags].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastOpenedAt: row.lastOpenedAt
    }
  }
}

function regionColumns(region: RegionSettings) {
  return {
    regionMode: region.mode,
    regionTimezone: region.timezone,
    regionLocale: region.locale,
    regionLatitude: region.latitude,
    regionLongitude: region.longitude,
    regionAccuracy: region.accuracy
  }
}

function regionFromRow(row: ProfileRow): RegionSettings {
  const mode = (REGION_MODES as readonly string[]).includes(row.regionMode) ? (row.regionMode as RegionMode) : 'real'
  return {
    mode,
    timezone: row.regionTimezone,
    locale: row.regionLocale,
    latitude: row.regionLatitude,
    longitude: row.regionLongitude,
    accuracy: row.regionAccuracy
  }
}
