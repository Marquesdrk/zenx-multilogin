import { settingsPatchSchema, settingsSchema, type SettingsPatch } from '@shared/schemas'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { appSettings } from '../db/schema'
import type { Db } from './DatabaseService'

/** Configurações chave/valor persistidas em `app_settings` (valores em JSON). */
export class SettingsService {
  private cache: Settings | null = null

  constructor(private readonly db: Db) {}

  async get(): Promise<Settings> {
    if (this.cache) return this.cache
    const rows = await this.db.select().from(appSettings)
    const stored: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value)
      } catch {
        // valor corrompido: cai no padrão
      }
    }
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const candidate = { ...merged, [key]: stored[key] }
      if (key in stored && settingsSchema.safeParse(candidate).success) merged[key] = stored[key]
    }
    this.cache = settingsSchema.parse(merged)
    return this.cache
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    const valid = settingsPatchSchema.parse(patch)
    const next = settingsSchema.parse({ ...(await this.get()), ...valid })
    for (const [key, value] of Object.entries(valid)) {
      if (value === undefined) continue
      const json = JSON.stringify(value)
      await this.db
        .insert(appSettings)
        .values({ key, value: json })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: json } })
    }
    this.cache = next
    return next
  }
}
