/**
 * Proxies: interpretação de linhas, túnel SOCKS5/HTTP com autenticação, verificação
 * de IP, ponte local e o serviço ProxyManager. Tudo contra servidores locais de teste.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { proxies as proxiesTable } from '../src/main/db/schema'
import { ProxyBridge } from '../src/main/proxy/bridge'
import { checkProxy, type IpLookupEndpoint } from '../src/main/proxy/checker'
import { openTunnel, type ProxyEndpoint } from '../src/main/proxy/tunnel'
import { proxyLaunchArgs } from '../src/main/services/BrowserManager'
import { parseProxyLine } from '../src/shared/proxyParse'
import { createTestEnv, profileInput, type TestEnv } from './helpers'
import { startHttpProxy, startIpLookup, startSocks5, type FakeProxy } from './proxyServers'

const AUTH = { user: 'zenx', pass: 's3cr:et' }

describe('parseProxyLine', () => {
  it.each([
    ['191.96.1.2:3949', { type: 'http', host: '191.96.1.2', port: 3949, username: '', password: '' }],
    ['191.96.1.2:3949:9f87:031d', { host: '191.96.1.2', port: 3949, username: '9f87', password: '031d' }],
    ['host.com:80:user:pa:ss', { host: 'host.com', username: 'user', password: 'pa:ss' }],
    ['user:pass@proxy.io:1080', { host: 'proxy.io', port: 1080, username: 'user', password: 'pass' }],
    ['socks5://u:p@br.proxy.com:1080', { type: 'socks5', host: 'br.proxy.com', username: 'u', password: 'p' }],
    ['socks5h://br.proxy.com:1080/', { type: 'socks5', host: 'br.proxy.com', port: 1080 }],
    ['https://u%40x:p@a.b:443', { type: 'https', username: 'u@x' }]
  ])('interpreta %s', (line, expected) => {
    expect(parseProxyLine(line)).toMatchObject(expected)
  })

  it.each(['', '# comentário', 'host', 'host:0', 'host:70000', 'ftp://h:1', 'user@:80', '-x.com:80', 'a:b:c'])(
    'rejeita %s',
    (line) => {
      expect(parseProxyLine(line)).toBeNull()
    }
  )

  it('usa o tipo padrão quando a linha não informa', () => {
    expect(parseProxyLine('1.2.3.4:1080', 'socks5')?.type).toBe('socks5')
  })
})

let target: Server
let targetPort: number
let lookup: { port: number; close(): Promise<void> }
let lookups: IpLookupEndpoint[]

beforeAll(async () => {
  target = createServer((_req, res) => res.end('alvo-ok'))
  await new Promise<void>((ok) => target.listen(0, '127.0.0.1', ok))
  targetPort = (target.address() as AddressInfo).port
  lookup = await startIpLookup()
  lookups = [
    {
      host: '127.0.0.1',
      port: lookup.port,
      tls: false,
      path: '/json',
      parse: (b) => {
        const o = b as Record<string, string>
        const [lat, lon] = (o.loc ?? '').split(',').map(Number)
        return {
          ip: o.ip ?? null,
          country: o.country ?? null,
          region: o.region ?? null,
          city: o.city ?? null,
          timezone: o.timezone ?? null,
          latitude: lat ?? null,
          longitude: lon ?? null
        }
      }
    }
  ]
})
afterAll(async () => {
  await new Promise((ok) => target.close(ok))
  await lookup.close()
})

/** GET simples sobre um socket já tunelado. */
async function getThrough(endpoint: ProxyEndpoint): Promise<string> {
  const socket = await openTunnel(endpoint, '127.0.0.1', targetPort, 5000)
  return new Promise((resolve, reject) => {
    let data = ''
    socket.on('data', (c: Buffer) => (data += c.toString()))
    socket.on('end', () => resolve(data))
    socket.on('error', reject)
    socket.write(`GET / HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n`)
    socket.resume()
  })
}

describe.each([
  ['socks5', startSocks5],
  ['http', startHttpProxy]
] as const)('túnel %s com autenticação', (type, start) => {
  let proxy: FakeProxy
  beforeAll(async () => {
    proxy = await start(AUTH)
  })
  afterAll(async () => {
    await proxy.close()
  })
  const endpoint = (password = AUTH.pass): ProxyEndpoint => ({
    type,
    host: '127.0.0.1',
    port: proxy.port,
    username: AUTH.user,
    password
  })

  it('conecta ao destino com as credenciais corretas', async () => {
    const response = await getThrough(endpoint())
    expect(response).toContain('alvo-ok')
    expect(proxy.hits.at(-1)).toEqual({ target: `127.0.0.1:${targetPort}`, user: AUTH.user })
  })

  it('verifica o IP de saída e a localização', async () => {
    const result = await checkProxy(endpoint(), lookups, 5000)
    expect(result).toMatchObject({
      ok: true,
      ip: '154.16.121.129',
      country: 'US',
      region: 'Texas',
      city: 'Houston',
      timezone: 'America/Chicago',
      latitude: 29.7633,
      longitude: -95.3633,
      error: null
    })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('informa senha incorreta com mensagem clara', async () => {
    const result = await checkProxy(endpoint('errada'), lookups, 5000)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/usuário ou a senha/)
  })
})

describe('falhas de conexão', () => {
  it('porta fechada', async () => {
    const result = await checkProxy({ type: 'http', host: '127.0.0.1', port: 1, username: null, password: null }, lookups, 3000)
    expect(result).toMatchObject({ ok: false })
    expect(result.error).toMatch(/recusada/)
  })

  it('tipo errado (SOCKS5 apontando para proxy HTTP)', async () => {
    const http = await startHttpProxy()
    try {
      const result = await checkProxy({ type: 'socks5', host: '127.0.0.1', port: http.port, username: null, password: null }, lookups, 3000)
      expect(result.ok).toBe(false)
      expect(result.error).not.toContain(AUTH.pass)
    } finally {
      await http.close()
    }
  })
})

describe('ponte SOCKS5 local', () => {
  it.each(['socks5', 'http'] as const)('encaminha com autenticação para proxy %s', async (type) => {
    const upstream = type === 'socks5' ? await startSocks5(AUTH) : await startHttpProxy(AUTH)
    const bridge = new ProxyBridge({ type, host: '127.0.0.1', port: upstream.port, username: AUTH.user, password: AUTH.pass })
    try {
      const port = await bridge.start()
      // O cliente (como o Chromium) usa a ponte sem credenciais.
      const response = await getThrough({ type: 'socks5', host: '127.0.0.1', port, username: null, password: null })
      expect(response).toContain('alvo-ok')
      expect(upstream.hits.at(-1)?.user).toBe(AUTH.user)
    } finally {
      await bridge.stop()
      await upstream.close()
    }
  })

  it('para de aceitar conexões ao ser encerrada', async () => {
    const bridge = new ProxyBridge({ type: 'socks5', host: '127.0.0.1', port: 1, username: 'u', password: 'p' })
    const port = await bridge.start()
    await bridge.stop()
    await expect(getThrough({ type: 'socks5', host: '127.0.0.1', port, username: null, password: null })).rejects.toThrow()
  })
})

describe('argumentos do Chromium', () => {
  it('sem credenciais usa o proxy direto e bloqueia DNS local e WebRTC fora do proxy', async () => {
    const { args, bridge } = await proxyLaunchArgs({ type: 'socks5', host: 'br.proxy.com', port: 1080, username: null, password: null })
    expect(bridge).toBeUndefined()
    expect(args).toContain('--proxy-server=socks5://br.proxy.com:1080')
    expect(args).toContain('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE br.proxy.com')
    expect(args).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp')
  })

  it('com credenciais usa a ponte local e nunca coloca a senha na linha de comando', async () => {
    const { args, bridge } = await proxyLaunchArgs({ type: 'http', host: 'p.com', port: 8080, username: 'user', password: 'segredo' })
    try {
      expect(bridge).toBeDefined()
      expect(args.find((a) => a.startsWith('--proxy-server='))).toMatch(/^--proxy-server=socks5:\/\/127\.0\.0\.1:\d+$/)
      expect(args.join(' ')).not.toMatch(/segredo|user/)
    } finally {
      await bridge?.stop()
    }
  })
})

describe('ProxyManager', () => {
  let env: TestEnv
  let upstream: FakeProxy
  beforeAll(async () => {
    upstream = await startSocks5(AUTH)
  })
  afterAll(async () => {
    await upstream.close()
  })
  beforeEach(async () => {
    env = await createTestEnv({ lookups, checkTimeoutMs: 5000 })
  })
  afterEach(async () => {
    await env.dispose()
  })

  const input = (over: Partial<Parameters<TestEnv['proxies']['create']>[0]> = {}) => ({
    name: '',
    type: 'socks5' as const,
    host: '127.0.0.1',
    port: upstream.port,
    username: AUTH.user,
    password: AUTH.pass,
    changeIpUrl: '',
    ...over
  })

  it('guarda a senha cifrada e nunca a devolve ao painel', async () => {
    const proxy = await env.proxies.create(input())
    expect(proxy).toMatchObject({ name: `127.0.0.1:${upstream.port}`, hasPassword: true, profileCount: 0 })
    expect(JSON.stringify(proxy)).not.toContain(AUTH.pass)
    const [row] = await env.database.db.select().from(proxiesTable).where(eq(proxiesTable.id, proxy.id))
    expect(row?.passwordEnc).toMatch(/^test:/)
    expect(row?.passwordEnc).not.toContain(AUTH.pass)
    expect((await env.proxies.endpoint(proxy.id)).password).toBe(AUTH.pass)
  })

  it('edição sem senha mantém a salva; senha vazia remove', async () => {
    const proxy = await env.proxies.create(input())
    const { password: _omit, ...withoutPassword } = input({ name: 'Renomeado' })
    await env.proxies.update(proxy.id, withoutPassword)
    expect((await env.proxies.endpoint(proxy.id)).password).toBe(AUTH.pass)
    const cleared = await env.proxies.update(proxy.id, input({ password: '' }))
    expect(cleared.hasPassword).toBe(false)
  })

  it('verifica e grava o último resultado; mudar o endereço invalida o resultado', async () => {
    const proxy = await env.proxies.create(input())
    const checked = await env.proxies.check(proxy.id)
    expect(checked.lastCheck).toMatchObject({ ok: true, country: 'US', city: 'Houston' })
    const moved = await env.proxies.update(proxy.id, input({ port: upstream.port + 1 }))
    expect(moved.lastCheck).toBeNull()
  })

  it('testa dados não salvos usando a senha salva quando omitida', async () => {
    const proxy = await env.proxies.create(input())
    const { password: _omit, ...withoutPassword } = input()
    expect((await env.proxies.test(withoutPassword, proxy.id)).ok).toBe(true)
    expect((await env.proxies.test(input({ password: 'x' }))).ok).toBe(false)
  })

  it('importa listas ignorando linhas inválidas', async () => {
    const result = await env.proxies.importList({
      type: 'http',
      text: '1.1.1.1:80\nlixo\n2.2.2.2:8080:u:p\n\nsocks5://a:b@h.com:1080\n# comentário'
    })
    expect(result).toEqual({ created: 3, skipped: 1 })
    const list = await env.proxies.list()
    expect(list.map((p) => p.type).sort()).toEqual(['http', 'http', 'socks5'])
  })

  it('vincula a perfis, duplica junto e excluir o proxy deixa o perfil sem proxy', async () => {
    const proxy = await env.proxies.create(input())
    const profile = await env.profiles.create(profileInput({ proxyId: proxy.id }))
    expect(profile.proxyId).toBe(proxy.id)
    const copy = await env.profiles.duplicate(profile.id)
    expect(copy.proxyId).toBe(proxy.id)
    expect((await env.proxies.require(proxy.id)).profileCount).toBe(2)
    await env.proxies.delete(proxy.id)
    expect((await env.profiles.require(profile.id)).proxyId).toBeNull()
  })

  it('recusa perfil com proxy inexistente e dados inválidos', async () => {
    await expect(
      env.profiles.create(profileInput({ proxyId: '33333333-3333-4333-8333-333333333333' }))
    ).rejects.toThrow(/proxy selecionado/)
    await expect(env.proxies.create(input({ host: 'http://x.com' }))).rejects.toThrow()
    await expect(env.proxies.create(input({ port: 0 }))).rejects.toThrow()
    await expect(env.proxies.create(input({ changeIpUrl: 'javascript:alert(1)' }))).rejects.toThrow()
  })
})
