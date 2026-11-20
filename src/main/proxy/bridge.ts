import { createServer, isIP, type AddressInfo, type Server, type Socket } from 'node:net'
import { openTunnel, SocketReader, type ProxyEndpoint } from './tunnel'

/**
 * Ponte SOCKS5 local para proxies com usuário e senha.
 *
 * O Chromium não aceita credenciais em `--proxy-server` (e não suporta SOCKS5 com
 * autenticação). Por isso, quando o proxy exige login, o navegador do perfil usa
 * esta ponte em 127.0.0.1 (porta aleatória, só loopback), e ela encaminha cada
 * conexão ao proxy real autenticando com as credenciais. A ponte existe apenas
 * enquanto o navegador do perfil está aberto.
 */
export class ProxyBridge {
  private server: Server | null = null
  private readonly sockets = new Set<Socket>()

  constructor(private readonly upstream: ProxyEndpoint) {}

  async start(): Promise<number> {
    const server = createServer((client) => void this.handle(client))
    server.maxConnections = 512
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    return (server.address() as AddressInfo).port
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private track(socket: Socket): void {
    this.sockets.add(socket)
    socket.once('close', () => this.sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  }

  private async handle(client: Socket): Promise<void> {
    this.track(client)
    // Só aceita conexões do próprio computador.
    if (client.remoteAddress !== '127.0.0.1' && client.remoteAddress !== '::ffff:127.0.0.1') {
      client.destroy()
      return
    }
    client.setTimeout(30_000, () => client.destroy())
    const reader = new SocketReader(client)
    try {
      const [version, count] = await reader.read(2)
      if (version !== 0x05) throw new Error('versão')
      const methods = await reader.read(count ?? 0)
      if (!methods.includes(0x00)) {
        client.end(Buffer.from([0x05, 0xff]))
        return
      }
      client.write(Buffer.from([0x05, 0x00]))

      const [, command, , atyp] = await reader.read(4)
      let host: string
      if (atyp === 0x01) host = [...(await reader.read(4))].join('.')
      else if (atyp === 0x03) {
        const [len] = await reader.read(1)
        host = (await reader.read(len ?? 0)).toString('utf8')
      } else if (atyp === 0x04) {
        const raw = await reader.read(16)
        host = Array.from({ length: 8 }, (_, i) => raw.readUInt16BE(i * 2).toString(16)).join(':')
      } else throw new Error('endereço')
      const portBytes = await reader.read(2)
      const port = portBytes.readUInt16BE(0)

      if (command !== 0x01) {
        client.end(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        return
      }
      if (!host || (atyp === 0x03 && isIP(host) === 0 && !/^[A-Za-z0-9.-]+$/.test(host))) throw new Error('host')

      let upstream: Socket
      try {
        upstream = await openTunnel(this.upstream, host, port)
      } catch {
        client.end(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        return
      }
      if (client.destroyed) {
        upstream.destroy()
        return
      }
      this.track(upstream)
      client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      reader.release()
      client.setTimeout(0)
      client.pipe(upstream)
      upstream.pipe(client)
      client.once('close', () => upstream.destroy())
      upstream.once('close', () => client.destroy())
    } catch {
      reader.release()
      client.destroy()
    }
  }
}
