import { z } from 'zod'
import { isValidLocale, isValidTimezone, REGION_MODES } from './region'
import { PAGES, PLATFORMS, PROXY_TYPES } from './types'

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

export const regionSchema = z.object({
  mode: z.enum(REGION_MODES),
  timezone: z
    .string()
    .max(64)
    .refine(isValidTimezone, 'Fuso horário inválido')
    .nullable(),
  locale: z
    .string()
    .max(20)
    .refine(isValidLocale, 'Idioma inválido')
    .nullable(),
  latitude: z.number('Latitude inválida').min(-90, 'Latitude entre -90 e 90').max(90, 'Latitude entre -90 e 90').nullable(),
  longitude: z.number('Longitude inválida').min(-180, 'Longitude entre -180 e 180').max(180, 'Longitude entre -180 e 180').nullable(),
  accuracy: z.number().int().min(1, 'Precisão mínima de 1 m').max(100_000, 'Precisão máxima de 100 km').nullable()
})
export type RegionInput = z.infer<typeof regionSchema>

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
  proxyId: idSchema.nullable(),
  region: regionSchema,
  tags: z.array(tagNameSchema).max(20, 'Máximo de 20 tags'),
  notes: z.string().max(2000, 'Máximo de 2000 caracteres')
})
  .superRefine((data, ctx) => {
    if (data.region.mode === 'proxy' && !data.proxyId) {
      ctx.addIssue({ code: 'custom', path: ['region'], message: 'Escolha um proxy para usar a região do IP dele, ou use o modo manual.' })
    }
    if (data.region.mode === 'manual' && (data.region.latitude === null) !== (data.region.longitude === null)) {
      ctx.addIssue({ code: 'custom', path: ['region'], message: 'Informe latitude e longitude juntas.' })
    }
  })
export type ProfileInput = z.infer<typeof profileInputSchema>

/** Domínio ou IPv4, sem esquema, porta ou espaços. */
export const proxyHostSchema = z
  .string()
  .trim()
  .min(1, 'Informe o host do proxy')
  .max(253, 'Host muito longo')
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/, 'Host inválido. Use um domínio ou IP, sem http:// nem porta')

export const proxyPortSchema = z
  .number({ error: 'Informe a porta' })
  .int('Porta inválida')
  .min(1, 'Porta entre 1 e 65535')
  .max(65535, 'Porta entre 1 e 65535')

/** URL de troca de IP (proxies móveis/rotativos). Muitos provedores usam http. */
export function isSafeChangeIpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export const proxyInputSchema = z.object({
  name: z.string().trim().max(80, 'Máximo de 80 caracteres'),
  type: z.enum(PROXY_TYPES, 'Tipo de proxy inválido'),
  host: proxyHostSchema,
  port: proxyPortSchema,
  username: z.string().trim().max(256, 'Usuário muito longo'),
  /** Ausente = manter a senha salva; vazio = sem senha. */
  password: z.string().max(512, 'Senha muito longa').optional(),
  changeIpUrl: z
    .string()
    .trim()
    .max(2048, 'URL muito longa')
    .refine((v) => v === '' || isSafeChangeIpUrl(v), 'Informe uma URL http(s):// válida')
})
export type ProxyInput = z.infer<typeof proxyInputSchema>

export const proxyImportSchema = z.object({
  text: z.string().max(200_000, 'Lista muito grande'),
  type: z.enum(PROXY_TYPES)
})
export type ProxyImport = z.infer<typeof proxyImportSchema>

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
