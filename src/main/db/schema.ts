import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('groups_name_idx').on(t.name)]
)

/** Biblioteca de proxies. A senha é gravada cifrada (DPAPI do Windows), nunca em texto puro. */
export const proxies = sqliteTable(
  'proxies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    username: text('username'),
    passwordEnc: text('password_enc'),
    changeIpUrl: text('change_ip_url'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastCheckAt: integer('last_check_at'),
    lastCheckOk: integer('last_check_ok', { mode: 'boolean' }),
    lastIp: text('last_ip'),
    lastCountry: text('last_country'),
    lastRegion: text('last_region'),
    lastCity: text('last_city'),
    lastLatencyMs: integer('last_latency_ms'),
    lastTimezone: text('last_timezone'),
    lastLatitude: real('last_latitude'),
    lastLongitude: real('last_longitude'),
    lastError: text('last_error')
  },
  (t) => [index('proxies_name_idx').on(t.name)]
)

export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    username: text('username'),
    homeUrl: text('home_url'),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
    proxyId: text('proxy_id').references(() => proxies.id, { onDelete: 'set null' }),
    notes: text('notes').notNull().default(''),
    /** Região simulada: real | proxy | manual. */
    regionMode: text('region_mode').notNull().default('real'),
    regionTimezone: text('region_timezone'),
    regionLocale: text('region_locale'),
    regionLatitude: real('region_latitude'),
    regionLongitude: real('region_longitude'),
    regionAccuracy: integer('region_accuracy'),
    /** Caminho relativo à raiz de dados: profiles/<uuid>/user-data */
    dataDir: text('data_dir').notNull().unique(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastOpenedAt: integer('last_opened_at')
  },
  (t) => [
    index('profiles_name_idx').on(t.name),
    index('profiles_username_idx').on(t.username),
    index('profiles_platform_idx').on(t.platform),
    index('profiles_group_idx').on(t.groupId),
    index('profiles_proxy_idx').on(t.proxyId),
    index('profiles_last_opened_idx').on(t.lastOpenedAt)
  ]
)

/** Plataformas de cada perfil (um perfil pode ter várias). `position` 0 é a principal. */
export const profilePlatforms = sqliteTable(
  'profile_platforms',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    position: integer('position').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.platform] }),
    index('profile_platforms_platform_idx').on(t.platform)
  ]
)

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull()
})

export const profileTags = sqliteTable(
  'profile_tags',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.profileId, t.tagId] }), index('profile_tags_tag_idx').on(t.tagId)]
)

export const profileEvents = sqliteTable(
  'profile_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    message: text('message').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    index('profile_events_created_idx').on(t.createdAt),
    index('profile_events_profile_idx').on(t.profileId)
  ]
)

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
