/**
 * Testes de integração do BrowserManager com o Chromium gerenciado real.
 * O navegador é aberto como processo comum (sem automação). Uma página HTTP local,
 * existente somente nos testes, grava/lê cookies e localStorage e relata os valores
 * de volta ao servidor de teste. Nenhuma rede social é acessada.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { profiles as profilesTable } from '../src/main/db/schema'
import { BrowserManager, type BrowserLauncher } from '../src/main/services/BrowserManager'
import { ChromiumLocator } from '../src/main/services/ChromiumLocator'
import type { BrowserState, ProfileDTO } from '../src/shared/types'
import { CHROMIUM_ROOT, createTestEnv, profileInput, type TestEnv } from './helpers'

interface Report {
  cookie: string
  storage: string | null
  webdriver: boolean
}

const PAGE = `<!doctype html><title>Zenx test page</title><script>
  const q = new URLSearchParams(location.search)
  const set = q.get('set')
  if (set) {
    document.cookie = 'zenx_session=' + set + '; max-age=86400; path=/'
    localStorage.setItem('zenx-session', set)
  }
  fetch('/report?p=' + q.get('p'), {
    method: 'POST',
    body: JSON.stringify({ cookie: document.cookie, storage: localStorage.getItem('zenx-session'), webdriver: navigator.webdriver })
  })
</script><h1>ok</h1>`

let server: Server
let base: string
const reports = new Map<string, Report>()
let env: TestEnv
let manager: BrowserManager
let launches: string[]
const locator = new ChromiumLocator(CHROMIUM_ROOT)
// Janelas de teste ficam fora da área visível.
const TEST_ARGS = ['--window-position=-3000,-3000', '--window-size=640,480']

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/report') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        reports.set(url.searchParams.get('p') ?? '', JSON.parse(body) as Report)
        res.end('ok')
      })
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE)
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise((ok) => server.close(ok))
})

beforeEach(async () => {
  env = await createTestEnv()
  launches = []
  reports.clear()
  manager = createManager()
})
afterEach(async () => {
  await manager.closeAll()
  await env.dispose()
})

function createManager(overrides: { launcher?: BrowserLauncher; resolveExecutable?: () => Promise<string> } = {}) {
  return new BrowserManager({
    getProfile: (id) => env.profiles.get(id),
    resolveUserDataDir: (id) => {
      const dir = env.profiles.userDataDir(id)
      launches.push(dir)
      return dir
    },
    resolveExecutable: overrides.resolveExecutable ?? (() => locator.requireExecutable()),
    getMaxOpen: async () => (await env.settings.get()).maxConcurrentBrowsers,
    markOpened: (id) => env.profiles.markOpened(id),
    logEvent: (type, message, profileId) => env.events.log(type, message, profileId),
    launcher: overrides.launcher,
    extraArgs: TEST_ARGS,
    allowedProtocols: ['https:', 'http:']
  })
}

/** Aponta a URL inicial do perfil para a página local (ignora a regra de HTTPS do formulário). */
async function setPage(profile: ProfileDTO, tag: string, value?: string): Promise<void> {
  const url = `${base}/page?p=${tag}${value ? `&set=${value}` : ''}`
  await env.database.db.update(profilesTable).set({ homeUrl: url }).where(eq(profilesTable.id, profile.id))
}

async function createProfile(name: string, tag: string, value?: string): Promise<ProfileDTO> {
  const profile = await env.profiles.create(profileInput({ name, homeUrl: '' }))
  await setPage(profile, tag, value)
  return profile
}

async function waitReport(tag: string, timeout = 30_000): Promise<Report> {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const report = reports.get(tag)
    if (report) {
      reports.delete(tag)
      return report
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`A página de teste "${tag}" não respondeu`)
}

describe('Chromium gerenciado', () => {
  it('está instalado e passa na verificação de integridade', async () => {
    const info = await locator.info(true)
    expect(info).toMatchObject({ installed: true, integrity: 'ok' })
    expect(info.executablePath && existsSync(info.executablePath)).toBe(true)
    expect(info.executablePath).not.toMatch(/Program Files/i)
  })

  it('informa erro compreensível quando o Chromium não existe', async () => {
    const info = await new ChromiumLocator(env.paths.root).info(true)
    expect(info).toMatchObject({ installed: false, integrity: 'missing' })
  })
})

describe('BrowserManager', () => {
  it('abre o Chromium com o diretório exclusivo do perfil e registra a abertura', async () => {
    const profile = await createProfile('A', 'a')
    const states: BrowserState['status'][] = []
    manager.on('state', (_id, state: BrowserState) => states.push(state.status))

    const state = await manager.open(profile.id)
    expect(state.status).toBe('open')
    expect(states).toEqual(['starting', 'open'])
    expect(launches).toEqual([env.profiles.userDataDir(profile.id)])
    await waitReport('a')
    expect((await env.profiles.require(profile.id)).lastOpenedAt).toBeTypeOf('number')
    expect((await env.events.list(5))[0]?.eventType).toBe('browser_started')
    expect(existsSync(`${env.profiles.userDataDir(profile.id)}/Default`)).toBe(true)
  })

  it('abre o navegador sem sinal de automação (permite login manual no Google)', async () => {
    const profile = await createProfile('Google', 'g')
    await manager.open(profile.id)
    expect((await waitReport('g')).webdriver).toBe(false)
  })

  it('abre dois perfis em processos independentes que não compartilham cookies nem localStorage', async () => {
    const a = await createProfile('A', 'a', 'conta-a')
    const b = await createProfile('B', 'b')
    await Promise.all([manager.open(a.id), manager.open(b.id)])
    expect(manager.pidForTesting(a.id)).not.toBe(manager.pidForTesting(b.id))
    expect(await waitReport('a')).toMatchObject({ cookie: 'zenx_session=conta-a', storage: 'conta-a' })
    expect(await waitReport('b')).toMatchObject({ cookie: '', storage: null })
  })

  it('preserva cookies e localStorage ao fechar e reabrir o perfil', async () => {
    const profile = await createProfile('Persistente', 'p', 'persistida')
    await manager.open(profile.id)
    expect(await waitReport('p')).toMatchObject({ storage: 'persistida' })
    await manager.close(profile.id)
    expect(manager.getState(profile.id).status).toBe('closed')

    await setPage(profile, 'p2')
    await manager.open(profile.id)
    expect(await waitReport('p2')).toMatchObject({ cookie: 'zenx_session=persistida', storage: 'persistida' })
  })

  it('não abre duplicatas com cliques rápidos e mantém a mesma instância ao focar', async () => {
    const profile = await createProfile('Duplo', 'd')
    const results = await Promise.all([manager.open(profile.id), manager.open(profile.id), manager.open(profile.id)])
    expect(results.map((r) => r.status)).toEqual(['open', 'open', 'open'])
    expect(launches).toHaveLength(1)

    const pid = manager.pidForTesting(profile.id)
    await manager.open(profile.id) // já aberto: apenas foca
    expect(manager.pidForTesting(profile.id)).toBe(pid)
    expect(launches).toHaveLength(1)
    expect(manager.activeCount()).toBe(1)
  })

  it('detecta quando o navegador é fechado fora do painel', async () => {
    const profile = await createProfile('Manual', 'm')
    await manager.open(profile.id)
    await waitReport('m')
    const closed = new Promise<void>((ok) =>
      manager.on('state', (_id, state: BrowserState) => state.status === 'closed' && ok())
    )
    const pid = manager.pidForTesting(profile.id) as number
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'])
    await closed
    expect(manager.getState(profile.id).status).toBe('closed')
    expect(manager.activeCount()).toBe(0)
    await expect.poll(async () => (await env.events.list(5))[0]?.eventType).toBe('browser_closed')
    expect(existsSync(env.profiles.userDataDir(profile.id))).toBe(true)
    expect(await env.profiles.get(profile.id)).not.toBeNull()
  })

  it('respeita o limite de navegadores simultâneos', async () => {
    await env.settings.update({ maxConcurrentBrowsers: 1 })
    const a = await createProfile('A', 'a')
    const b = await createProfile('B', 'b')
    await manager.open(a.id)
    await expect(manager.open(b.id)).rejects.toMatchObject({ code: 'LIMIT_REACHED' })
    expect(manager.getState(b.id).status).toBe('closed')
    await manager.close(a.id)
    expect((await manager.open(b.id)).status).toBe('open')
  })

  it('libera o bloqueio após falha e permite tentar novamente', async () => {
    const profile = await createProfile('Falha', 'f')
    let fail = true
    manager = createManager({
      resolveExecutable: async () => {
        if (fail) throw new Error('executável indisponível')
        return locator.requireExecutable()
      }
    })
    await expect(manager.open(profile.id)).rejects.toMatchObject({ code: 'LAUNCH_FAILED' })
    expect(manager.getState(profile.id).status).toBe('error')
    expect((await env.events.list(5))[0]?.eventType).toBe('browser_failed')

    fail = false
    expect((await manager.open(profile.id)).status).toBe('open')
  })

  it('rejeita perfis inexistentes e identificadores inválidos', async () => {
    await expect(manager.open('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(manager.open('../../etc')).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(manager.activeCount()).toBe(0)
  })

  it('recusa URL inicial fora de HTTPS na configuração de produção', async () => {
    const profile = await createProfile('Inseguro', 'i')
    const strict = new BrowserManager({
      getProfile: (id) => env.profiles.get(id),
      resolveUserDataDir: (id) => env.profiles.userDataDir(id),
      resolveExecutable: () => locator.requireExecutable(),
      getMaxOpen: async () => 10,
      markOpened: (id) => env.profiles.markOpened(id),
      logEvent: (type, message, profileId) => env.events.log(type, message, profileId)
    })
    await expect(strict.open(profile.id)).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(strict.activeCount()).toBe(0)
  })

  it('excluir um perfil após fechar o navegador remove só o diretório dele', async () => {
    const a = await createProfile('A', 'a')
    const b = await createProfile('B', 'b')
    await manager.open(a.id)
    await manager.open(b.id)
    await Promise.all([waitReport('a'), waitReport('b')])
    await manager.close(a.id)
    await env.profiles.delete(a.id)
    expect(existsSync(env.profiles.userDataDir(a.id))).toBe(false)
    expect(manager.getState(b.id).status).toBe('open')
    expect(existsSync(`${env.profiles.userDataDir(b.id)}/Default`)).toBe(true)
  })
})
