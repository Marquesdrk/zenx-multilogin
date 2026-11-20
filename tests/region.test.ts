/**
 * Script de região executado em um contexto JavaScript isolado (vm), com Date e Intl
 * próprios, comparando o resultado com o Intl nativo no fuso escolhido.
 */
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { REGION_INJECT_SOURCE } from '../src/main/region/inject'
import { applyLanguagePreference, prepareRegion, regionExtensionDir } from '../src/main/region/region'
import { acceptLanguages, DEFAULT_REGION, localeForCountry } from '../src/shared/region'
import { resolveRegionConfig } from '../src/main/region/resolve'
import { profileInputSchema, type ProfileInput } from '../src/shared/schemas'
import type { ProxyCheck, ProxyDTO } from '../src/shared/types'
import { profileInput } from './helpers'

function sandbox(timezone: string) {
  const context = createContext({ setTimeout, clearTimeout })
  runInContext(`(${REGION_INJECT_SOURCE})(${JSON.stringify({ timezone, geo: null })})`, context)
  return (code: string): unknown => runInContext(code, context)
}

/** Campos esperados no fuso, via Intl nativo do processo de teste. */
function expected(timezone: string, t: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short'
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value])
  )
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
  return {
    year: +parts.year!,
    month: +parts.month! - 1,
    day: +parts.day!,
    hours: +parts.hour!,
    minutes: +parts.minute!,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday!),
    offset: -(asUtc - (t - (t % 1000))) / 60000 || 0
  }
}

const ZONES = ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata', 'America/Sao_Paulo', 'Australia/Lord_Howe', 'Pacific/Chatham', 'UTC']
const INSTANTS = [
  Date.UTC(2024, 0, 15, 12, 0),
  Date.UTC(2024, 2, 10, 6, 59), // antes da mudança de horário nos EUA
  Date.UTC(2024, 2, 10, 7, 1), // depois
  Date.UTC(2024, 2, 31, 0, 30), // Europa
  Date.UTC(2024, 2, 31, 1, 30),
  Date.UTC(2024, 6, 4, 23, 45),
  Date.UTC(2024, 10, 3, 5, 30), // fim do horário de verão nos EUA
  Date.UTC(2024, 10, 3, 6, 30),
  Date.UTC(1999, 11, 31, 23, 59, 59),
  Date.UTC(2030, 5, 1, 3, 0)
]

describe.each(ZONES)('fuso %s', (zone) => {
  const run = sandbox(zone)

  it('getters, dia da semana e getTimezoneOffset batem com o Intl', () => {
    for (const t of INSTANTS) {
      const got = run(`(() => { const d = new Date(${t}); return {
        year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hours: d.getHours(),
        minutes: d.getMinutes(), weekday: d.getDay(), offset: d.getTimezoneOffset() } })()`)
      expect(got, new Date(t).toISOString()).toEqual(expected(zone, t))
    }
  })

  it('Intl.DateTimeFormat usa o fuso por padrão, mas respeita timeZone explícito', () => {
    const canonical = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone
    expect(run('Intl.DateTimeFormat().resolvedOptions().timeZone')).toBe(canonical)
    expect(run('new Intl.DateTimeFormat("en-US").resolvedOptions().timeZone')).toBe(canonical)
    expect(run('new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai" }).resolvedOptions().timeZone')).toBe('Asia/Dubai')
  })

  it('new Date(campos) e setters interpretam a hora no fuso escolhido', () => {
    const roundtrip = run(`(() => {
      const d = new Date(2024, 6, 15, 10, 30, 5)
      const s = new Date(2024, 0, 1); s.setHours(18, 45); s.setDate(20); s.setMonth(8)
      return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(),
              s.getMonth(), s.getDate(), s.getHours(), s.getMinutes()]
    })()`)
    expect(roundtrip).toEqual([2024, 6, 15, 10, 30, 5, 8, 20, 18, 45])
    const instant = run('new Date(2024, 6, 15, 10, 30).getTime()') as number
    expect(expected(zone, instant)).toMatchObject({ year: 2024, month: 6, day: 15, hours: 10, minutes: 30 })
  })

  it('Date.parse: sem fuso é hora local; com Z/offset/data ISO pura é absoluto', () => {
    const local = run('Date.parse("2024-07-15T10:30:00")') as number
    expect(expected(zone, local)).toMatchObject({ hours: 10, minutes: 30, day: 15 })
    expect(run('Date.parse("2024-07-15T10:30:00Z")')).toBe(Date.UTC(2024, 6, 15, 10, 30))
    expect(run('Date.parse("2024-07-15")')).toBe(Date.UTC(2024, 6, 15))
    expect(run('Date.parse("2024-07-15T10:30:00+02:00")')).toBe(Date.UTC(2024, 6, 15, 8, 30))
    expect(run('new Date("2024-07-15T10:30:00").getHours()')).toBe(10)
  })

  it('toString mostra o deslocamento do fuso e toLocaleString usa o fuso', () => {
    const t = Date.UTC(2024, 0, 15, 12, 0)
    const e = expected(zone, t)
    const text = run(`new Date(${t}).toString()`) as string
    const off = -e.offset
    const sign = off < 0 ? '-' : '+'
    const hhmm = `${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}${String(Math.abs(off) % 60).padStart(2, '0')}`
    expect(text).toContain(`GMT${sign}${hhmm}`)
    expect(text).toContain(`${String(e.hours).padStart(2, '0')}:${String(e.minutes).padStart(2, '0')}:00`)
    expect(run(`new Date(${t}).toLocaleString("en-US")`)).toBe(new Date(t).toLocaleString('en-US', { timeZone: zone }))
    expect(run('new Date(NaN).toString()')).toBe('Invalid Date')
  })
})

describe('aparência nativa', () => {
  const run = sandbox('America/New_York')
  it('funções substituídas se apresentam como nativas e Date continua coerente', () => {
    expect(run('Date.prototype.getHours.toString()')).toBe('function getHours() { [native code] }')
    expect(run('Function.prototype.toString.toString()')).toBe('function toString() { [native code] }')
    expect(run('Date.prototype.getHours.hasOwnProperty("prototype")')).toBe(false)
    expect(run('new Date() instanceof Date && new Date().constructor === Date')).toBe(true)
    expect(run('typeof Date()')).toBe('string')
    expect(run('Date.UTC(2024, 0, 1)')).toBe(Date.UTC(2024, 0, 1))
    expect(run('Math.abs(Date.now() - ' + Date.now() + ') < 5000')).toBe(true)
    expect(run('Date.prototype.setHours.length')).toBe(4)
  })
})

describe('idioma e arquivos do perfil', () => {
  it('mapeia país para idioma e monta Accept-Language', () => {
    expect(localeForCountry('us')).toBe('en-US')
    expect(localeForCountry('BR')).toBe('pt-BR')
    expect(localeForCountry('XX')).toBeNull()
    expect(acceptLanguages('en-US')).toBe('en-US,en')
    expect(acceptLanguages('fil-PH')).toBe('fil-PH,fil')
  })

  it('aplica e desfaz somente os idiomas definidos pelo app, preservando o resto', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zenx-region-'))
    try {
      const userData = join(root, 'user-data')
      const prefsFile = join(userData, 'Default', 'Preferences')
      await mkdir(join(userData, 'Default'), { recursive: true })
      await writeFile(prefsFile, JSON.stringify({ profile: { name: 'x' }, intl: { accept_languages: 'pt-BR,pt' } }))
      await applyLanguagePreference(userData, 'ja-JP')
      let prefs = JSON.parse(await readFile(prefsFile, 'utf8'))
      expect(prefs.intl.accept_languages).toBe('ja-JP,ja')
      expect(prefs.profile.name).toBe('x')
      await applyLanguagePreference(userData, null)
      prefs = JSON.parse(await readFile(prefsFile, 'utf8'))
      expect(prefs.intl.accept_languages).toBeUndefined()
      expect(prefs.profile.name).toBe('x')

      const args = await prepareRegion(userData, { timezone: 'Asia/Tokyo', locale: 'ja-JP', geo: { latitude: 35.68, longitude: 139.69, accuracy: 50 } })
      const ext = regionExtensionDir(userData)
      expect(args).toEqual([`--load-extension=${ext}`, '--lang=ja-JP'])
      const script = await readFile(join(ext, 'region.js'), 'utf8')
      expect(script).toContain('"Asia/Tokyo"')
      expect(JSON.parse(await readFile(join(ext, 'manifest.json'), 'utf8')).content_scripts[0].world).toBe('MAIN')
      expect(await prepareRegion(userData, null)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('resolveRegionConfig', () => {
  const base = { mode: 'real' as const, timezone: null, locale: null, latitude: null, longitude: null, accuracy: null }
  const proxyDTO = (check: Partial<ProxyCheck> | null): ProxyDTO => ({
    id: 'p', name: 'p', type: 'socks5', host: 'h', port: 1, username: null, hasPassword: false, changeIpUrl: null,
    createdAt: 0, updatedAt: 0, profileCount: 1,
    lastCheck: check && { ok: true, checkedAt: 0, ip: '1.1.1.1', country: 'US', region: null, city: null, timezone: 'America/Chicago', latitude: 29.76, longitude: -95.36, latencyMs: 10, error: null, ...check }
  })

  it('real: não altera nada', async () => {
    expect(await resolveRegionConfig({ region: base, proxyId: 'p' }, async () => proxyDTO({}))).toBeNull()
  })

  it('proxy: verifica na abertura e usa fuso, idioma do país e coordenadas do IP', async () => {
    let checks = 0
    const config = await resolveRegionConfig({ region: { ...base, mode: 'proxy' }, proxyId: 'p' }, async () => {
      checks++
      return proxyDTO({})
    })
    expect(checks).toBe(1)
    expect(config).toEqual({ timezone: 'America/Chicago', locale: 'en-US', geo: { latitude: 29.76, longitude: -95.36, accuracy: 100 } })
  })

  it('proxy: se o proxy falhar, não abre (não expõe a localização real)', async () => {
    await expect(
      resolveRegionConfig({ region: { ...base, mode: 'proxy' }, proxyId: 'p' }, async () => proxyDTO({ ok: false, error: 'Conexão recusada.' }))
    ).rejects.toMatchObject({ code: 'PROXY_FAILED' })
    await expect(resolveRegionConfig({ region: { ...base, mode: 'proxy' }, proxyId: null }, async () => proxyDTO({}))).rejects.toMatchObject({
      code: 'VALIDATION'
    })
  })

  it('manual: usa os campos preenchidos e ignora os vazios', async () => {
    expect(
      await resolveRegionConfig({ region: { ...base, mode: 'manual', timezone: 'Europe/Paris' }, proxyId: null }, async () => proxyDTO({}))
    ).toEqual({ timezone: 'Europe/Paris', locale: null, geo: null })
    expect(await resolveRegionConfig({ region: { ...base, mode: 'manual' }, proxyId: null }, async () => proxyDTO({}))).toBeNull()
  })
})

describe('validação da região no cadastro', () => {
  const input = (region: Partial<ProfileInput['region']>, proxyId: string | null = null) => ({
    ...profileInput({ proxyId }),
    region: { ...DEFAULT_REGION, ...region }
  })
  it('exige proxy no modo "pelo IP do proxy" e coordenadas em par', () => {
    expect(profileInputSchema.safeParse(input({ mode: 'proxy' })).success).toBe(false)
    expect(profileInputSchema.safeParse(input({ mode: 'proxy' }, '33333333-3333-4333-8333-333333333333')).success).toBe(true)
    expect(profileInputSchema.safeParse(input({ mode: 'manual', latitude: 10 })).success).toBe(false)
    expect(profileInputSchema.safeParse(input({ mode: 'manual', latitude: 91, longitude: 0 })).success).toBe(false)
  })
  it('recusa fuso e idioma inexistentes', () => {
    expect(profileInputSchema.safeParse(input({ mode: 'manual', timezone: 'Mars/Olympus' })).success).toBe(false)
    expect(profileInputSchema.safeParse(input({ mode: 'manual', locale: 'xx_invalid!' })).success).toBe(false)
    expect(profileInputSchema.safeParse(input({ mode: 'manual', timezone: 'Asia/Tokyo', locale: 'ja-JP' })).success).toBe(true)
  })
})
