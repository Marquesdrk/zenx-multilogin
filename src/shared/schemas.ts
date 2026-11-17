import { z } from 'zod'
import { PAGES, PLATFORMS } from './types'

/** Somente HTTPS é aceito para URLs configuradas pelo formulário. */
export function isSafeHomeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.length > 0 && !url.username && !url.password
  } catch {
    return false
  }
}

export const idSchema = z.uuid()

export const homeUrlSchema = z
  .string()
  .trim()
  .max(2048, 'URL muito longa')
  .refine((v) => v === '' || isSafeHomeUrl(v), 'Informe uma URL HTTPS válida (https://...)')

export const tagNameSchema = z.string().trim().min(1).max(32, 'Tag com no máximo 32 caracteres')

export const profileInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do perfil').max(80, 'Máximo de 80 caracteres'),
  platforms: z
    .array(z.enum(PLATFORMS))
    .min(1, 'Selecione ao menos uma plataforma')
    .max(PLATFORMS.length)
    .refine((list) => new Set(list).size === list.length, 'Plataforma repetida'),
  username: z.string().trim().max(120, 'Máximo de 120 caracteres'),
  homeUrl: homeUrlSchema,
  groupId: idSchema.nullable(),
  tags: z.array(tagNameSchema).max(20, 'Máximo de 20 tags'),
  notes: z.string().max(2000, 'Máximo de 2000 caracteres')
})
export type ProfileInput = z.infer<typeof profileInputSchema>

export const groupInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do grupo').max(60, 'Máximo de 60 caracteres'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
})
export type GroupInput = z.infer<typeof groupInputSchema>

export const settingsSchema = z.object({
  startMaximized: z.boolean(),
  confirmBeforeClosing: z.boolean(),
  reopenLastPage: z.boolean(),
  lastPage: z.enum(PAGES),
  maxConcurrentBrowsers: z.number().int().min(1).max(50),
  showResourceWarnings: z.boolean()
})
export const settingsPatchSchema = settingsSchema.partial()
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const idPayloadSchema = z.object({ id: idSchema })
export const idsPayloadSchema = z.object({ ids: z.array(idSchema).min(1).max(500) })
