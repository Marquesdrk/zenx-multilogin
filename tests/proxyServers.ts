/**
 * Servidores de proxy falsos, somente para testes: SOCKS5 (RFC 1928/1929) e
 * HTTP CONNECT com autenticação Basic. Registram cada conexão aceita.
 */
import { createServer as createHttpServer, request, type Server as HttpServer } from 'node:http'
import { connect, createServer, type AddressInfo, type Server, type Socket } from 'node:net'
import { SocketReader } from '../src/main/proxy/tunnel'

export interface Hit {
  target: string
  user: string | null
}

export interface FakeProxy {
  port: number
  hits: Hit[]
  close(): Promise<void>
}

function track(server: Server): Set<Socket> {
  const sockets = new Set<Socket>()
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
    s.on('error', () => s.destroy())
  })
  return sockets
}

async function listen(server: Server | HttpServer): Promise<number> {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  return (server.address() as AddressInfo).port
}

function closer(server: Server, sockets: Set<Socket>) {
  return async () => {
    for (const s of sockets) s.destroy()
    await new Promise<void>((ok) => server.close(() => ok()))
  }
}

function pipeTo(client: Socket, host: string, port: number, onReady: () => void): void {
  const upstream = connect({ host, port }, onReady)
  upstream.on('error', () => client.destroy())
  client.on('close', () => upstream.destroy())
  upstream.on('close', () => client.destroy())
  client.pipe(upstream)
  upstream.pipe(client)
}

/** SOCKS5. Com `auth`, exige usuário e senha. */
export async function startSocks5(auth?: { user: string; pass: string }): Promise<FakeProxy> {
  const hits: Hit[] = []
  const server = createServer((client) => {
    void (async () => {
      const reader = new SocketReader(client)
      try {
        const [, n] = await reader.read(2)
        const methods = await reader.read(n ?? 0)
        let user: string | null = null
        if (auth) {
          if (!methods.includes(0x02)) return client.end(Buffer.from([0x05, 0xff]))
          client.write(Buffer.from([0x05, 0x02]))
          const [, ulen] = await reader.read(2)
          user = (await reader.read(ulen ?? 0)).toString()
          const [plen] = await reader.read(1)
          const pass = (await reader.read(plen ?? 0)).toString()
          const ok = user === auth.user && pass === auth.pass
          client.write(Buffer.from([0x01, ok ? 0x00 : 0x01]))
          if (!ok) return client.end()
        } else {
          client.write(Buffer.from([0x05, 0x00]))
        }
        const [, , , atyp] = await reader.read(4)
        let host: string
        if (atyp === 0x01) host = [...(await reader.read(4))].join('.')
        else {
          const [len] = await reader.read(1)
          host = (await reader.read(len ?? 0)).toString()
        }
        const port = (await reader.read(2)).readUInt16BE(0)
        hits.push({ target: `${host}:${port}`, user })
        reader.release()
        pipeTo(client, host, port, () => {
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          client.resume()
        })
      } catch {
        client.destroy()
      }
    })()
  })
  const sockets = track(server)
  const port = await listen(server)
  return { port, hits, close: closer(server, sockets) }
}

/** Proxy HTTP: CONNECT e requisições absolutas (GET http://...). */
export async function startHttpProxy(auth?: { user: string; pass: string }): Promise<FakeProxy> {
  const hits: Hit[] = []
  const expected = auth ? `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}` : null
  const server = createHttpServer((req, res) => {
    // Proxy de requisições http:// comuns (modo direto do Chromium, sem CONNECT).
    if (expected && req.headers['proxy-authorization'] !== expected) {
      res.writeHead(407, { 'proxy-authenticate': 'Basic realm="t"' }).end()
      return
    }
    const url = new URL(req.url ?? '/')
    hits.push({ target: url.host, user: auth?.user ?? null })
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith('proxy-')))
    const upstream = request(
      { host: url.hostname, port: Number(url.port || 80), path: url.pathname + url.search, method: req.method, headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
        upstreamRes.pipe(res)
      }
    )
    upstream.on('error', () => res.destroy())
    req.pipe(upstream)
  })
  server.on('connect', (req, client: Socket, head: Buffer) => {
    if (expected && req.headers['proxy-authorization'] !== expected) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="t"\r\n\r\n')
      return
    }
    const [host = '', port = '0'] = (req.url ?? '').split(':')
    hits.push({ target: req.url ?? '', user: auth?.user ?? null })
    pipeTo(client, host, Number(port), () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) client.unshift(head)
    })
  })
  const sockets = new Set<Socket>()
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  const port = await listen(server)
  return {
    port,
    hits,
    close: async () => {
      for (const s of sockets) s.destroy()
      await new Promise<void>((ok) => server.close(() => ok()))
    }
  }
}

/** Serviço de IP falso (formato do ipinfo.io), em HTTP simples. */
export async function startIpLookup(): Promise<{ port: number; close(): Promise<void> }> {
  const server = createHttpServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ip: '154.16.121.129', country: 'US', region: 'Texas', city: 'Houston', loc: '29.7633,-95.3633', timezone: 'America/Chicago' }))
  })
  const port = await listen(server)
  return { port, close: () => new Promise<void>((ok) => server.close(() => ok())) }
}
