import { randomUUID } from 'node:crypto'
import { count, desc, eq } from 'drizzle-orm'
import { AppError } from '@shared/errors'
import { proxyDefaultName, parseProxyLine } from '@shared/proxyParse'
import { proxyImportSchema, proxyInputSchema, type ProxyImport, type ProxyInput } from '@shared/schemas'
import type { ChangeIpResult, ProxyCheck, ProxyDTO, ProxyImportResult, ProxyType } from '@shared/types'
import { profiles, proxies } from '../db/schema'
import { assertUuid } from '../paths'
import { checkProxy, type IpLookupEndpoint } from '../proxy/checker'
import type { SecretStore } from '../proxy/secrets'
import type { ProxyEndpoint } from '../proxy/tunnel'
import type { Db } from './DatabaseService'
import type { EventLogger } from './EventLogger'

type ProxyRow = typeof proxies.$inferSelect

export interface ProxyManagerOptions {
  /** Serviços de IP usados na verificação. Injetável nos testes. */
  lookups?: readonly IpLookupEndpoint[]
  checkTimeoutMs?: number
}

const MAX_IMPORT = 1000

export class ProxyManager {
  constructor(
    private readonly db: Db,
    private readonly secrets: SecretStore,
    private readonly events: EventLogger,
    private readonly options: ProxyManagerOptions = {}
  ) {}

  async list(): Promise<ProxyDTO[]> {
    const rows = await this.db.select().from(proxies).orderBy(desc(proxies.createdAt))
    const counts = await this.db
      .select({ proxyId: profiles.proxyId, total: count() })
      .from(profiles)
      .groupBy(profiles.proxyId)
    const byProxy = new Map(counts.map((c) => [c.proxyId, c.total]))
    return rows.map((row) => this.toDTO(row, byProxy.get(row.id) ?? 0))
  }

  async get(id: string): Promise<ProxyDTO | null> {
    assertUuid(id)
    const [row] = await this.db.select().from(proxies).where(eq(proxies.id, id))
    if (!row) return null
    const [usage] = await this.db.select({ total: count() }).from(profiles).where(eq(profiles.proxyId, id))
    return this.toDTO(row, usage?.total ?? 0)
  }

  async require(id: string): Promise<ProxyDTO> {
    const proxy = await this.get(id)
    if (!proxy) throw new AppError('NOT_FOUND', 'Proxy não encontrado.')
    return proxy
  }

  async exists(id: string): Promise<boolean> {
    assertUuid(id)
    const [row] = await this.db.select({ id: proxies.id }).from(proxies).where(eq(proxies.id, id))
    return Boolean(row)
  }

  async create(input: ProxyInput): Promise<ProxyDTO> {
    const data = proxyInputSchema.parse(input)
    const id = randomUUID()
    const now = Date.now()
    await this.db.insert(proxies).values({
      id,
      name: data.name || proxyDefaultName(data.host, data.port),
      type: data.type,
      host: data.host,
      port: data.port,
      username: data.username || null,
      passwordEnc: data.password ? this.secrets.encrypt(data.password) : null,
      changeIpUrl: data.changeIpUrl || null,
      createdAt: now,
      updatedAt: now
    })
    const proxy = await this.require(id)
    await this.events.log('proxy_created', `Proxy "${proxy.name}" adicionado`)
    return proxy
  }

  async update(id: string, input: ProxyInput): Promise<ProxyDTO> {
    assertUuid(id)
    const [current] = await this.db.select().from(proxies).where(eq(proxies.id, id))
    if (!current) throw new AppError('NOT_FOUND', 'Proxy não encontrado.')
    const data = proxyInputSchema.parse(input)
    const passwordEnc =
      data.password === undefined ? current.passwordEnc : data.password ? this.secrets.encrypt(data.password) : null
    const endpointChanged =
      current.type !== data.type ||
      current.host !== data.host ||
      current.port !== data.port ||
      (current.username ?? '') !== data.username ||
      passwordEnc !== current.passwordEnc
    await this.db
      .update(proxies)
      .set({
        name: data.name || proxyDefaultName(data.host, data.port),
        type: data.type,
        host: data.host,
        port: data.port,
        username: data.username || null,
        passwordEnc,
        changeIpUrl: data.changeIpUrl || null,
        updatedAt: Date.now(),
        // Endereço ou credenciais novos invalidam a última verificação.
        ...(endpointChanged ? clearedCheck() : {})
      })
      .where(eq(proxies.id, id))
    const proxy = await this.require(id)
    await this.events.log('proxy_updated', `Proxy "${proxy.name}" atualizado`)
    return proxy
  }

  /** Remove o proxy. Os perfis que o usavam passam a abrir sem proxy. */
  async delete(id: string): Promise<void> {
    const proxy = await this.require(id)
    await this.db.update(profiles).set({ proxyId: null }).where(eq(profiles.proxyId, id))
    await this.db.delete(proxies).where(eq(proxies.id, id))
    await this.events.log('proxy_deleted', `Proxy "${proxy.name}" removido`)
  }

  /** Importa uma lista (um proxy por linha). Linhas inválidas são ignoradas. */
  async importList(input: ProxyImport): Promise<ProxyImportResult> {
    const { text, type } = proxyImportSchema.parse(input)
    const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
    if (lines.length > MAX_IMPORT) {
      throw new AppError('VALIDATION', `Importe no máximo ${MAX_IMPORT} proxies por vez.`)
    }
    let created = 0
    let skipped = 0
    const now = Date.now()
    for (const line of lines) {
      const parsed = parseProxyLine(line, type)
      if (!parsed) {
        skipped++
        continue
      }
      await this.db.insert(proxies).values({
        id: randomUUID(),
        name: proxyDefaultName(parsed.host, parsed.port),
        type: parsed.type,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username || null,
        passwordEnc: parsed.password ? this.secrets.encrypt(parsed.password) : null,
        changeIpUrl: null,
        createdAt: now + created,
        updatedAt: now + created
      })
      created++
    }
    if (created > 0) await this.events.log('proxy_created', `${created} ${created === 1 ? 'proxy importado' : 'proxies importados'}`)
    return { created, skipped }
  }

  /** Credenciais em texto puro, somente para uso interno (abertura do navegador e verificação). */
  async endpoint(id: string): Promise<ProxyEndpoint> {
    assertUuid(id)
    const [row] = await this.db.select().from(proxies).where(eq(proxies.id, id))
    if (!row) throw new AppError('NOT_FOUND', 'O proxy deste perfil não existe mais.')
    return {
      type: row.type as ProxyType,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.passwordEnc ? this.secrets.decrypt(row.passwordEnc) : null
    }
  }

  /** Verifica um proxy salvo e grava o resultado. */
  async check(id: string): Promise<ProxyDTO> {
    const result = await this.runCheck(await this.endpoint(id))
    await this.db
      .update(proxies)
      .set({
        lastCheckAt: result.checkedAt,
        lastCheckOk: result.ok,
        lastIp: result.ip,
        lastCountry: result.country,
        lastRegion: result.region,
        lastCity: result.city,
        lastLatencyMs: result.latencyMs,
        lastTimezone: result.timezone,
        lastLatitude: result.latitude,
        lastLongitude: result.longitude,
        lastError: result.error
      })
      .where(eq(proxies.id, id))
    return this.require(id)
  }

  /**
   * Verifica dados ainda não salvos (botão "Verificar" do formulário).
   * Com `id`, a senha omitida é a já salva naquele proxy.
   */
  async test(input: ProxyInput, id?: string): Promise<ProxyCheck> {
    const data = proxyInputSchema.parse(input)
    let password = data.password ?? null
    if (data.password === undefined && id) password = (await this.endpoint(id)).password
    return this.runCheck({
      type: data.type,
      host: data.host,
      port: data.port,
      username: data.username || null,
      password
    })
  }

  /** Chama a URL de troca de IP do provedor (proxies móveis/rotativos). */
  async changeIp(id: string): Promise<ChangeIpResult> {
    const proxy = await this.require(id)
    if (!proxy.changeIpUrl) throw new AppError('VALIDATION', 'Este proxy não tem URL de troca de IP.')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(proxy.changeIpUrl, { signal: controller.signal, redirect: 'follow' })
      await response.body?.cancel().catch(() => undefined)
      await this.db.update(proxies).set(clearedCheck()).where(eq(proxies.id, id))
      return response.ok
        ? { ok: true, status: response.status, message: 'Troca de IP solicitada. Verifique o proxy em alguns segundos.' }
        : { ok: false, status: response.status, message: `O provedor respondeu ${response.status} à troca de IP.` }
    } catch {
      return { ok: false, status: null, message: 'Não foi possível acessar a URL de troca de IP.' }
    } finally {
      clearTimeout(timer)
    }
  }

  private runCheck(endpoint: ProxyEndpoint): Promise<ProxyCheck> {
    return checkProxy(endpoint, this.options.lookups, this.options.checkTimeoutMs)
  }

  private toDTO(row: ProxyRow, profileCount: number): ProxyDTO {
    return {
      id: row.id,
      name: row.name,
      type: row.type as ProxyType,
      host: row.host,
      port: row.port,
      username: row.username,
      hasPassword: Boolean(row.passwordEnc),
      changeIpUrl: row.changeIpUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      profileCount,
      lastCheck:
        row.lastCheckAt === null
          ? null
          : {
              ok: Boolean(row.lastCheckOk),
              checkedAt: row.lastCheckAt,
              ip: row.lastIp,
              country: row.lastCountry,
              region: row.lastRegion,
              city: row.lastCity,
              latencyMs: row.lastLatencyMs,
              timezone: row.lastTimezone,
              latitude: row.lastLatitude,
              longitude: row.lastLongitude,
              error: row.lastError
            }
    }
  }
}

function clearedCheck() {
  return {
    lastCheckAt: null,
    lastCheckOk: null,
    lastIp: null,
    lastCountry: null,
    lastRegion: null,
    lastCity: null,
    lastLatencyMs: null,
    lastTimezone: null,
    lastLatitude: null,
    lastLongitude: null,
    lastError: null
  }
}
