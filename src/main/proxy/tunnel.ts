import { isIP, Socket, connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { AppError } from '@shared/errors'
import type { ProxyType } from '@shared/types'

/** Proxy com credenciais em texto puro. Existe apenas em memória no processo principal. */
export interface ProxyEndpoint {
  type: ProxyType
  host: string
  port: number
  username: string | null
  password: string | null
}

/**
 * Lê bytes de um socket sob demanda durante um handshake.
 * Ao terminar, `release()` devolve ao socket o que sobrou no buffer.
 */
export class SocketReader {
  private buffer = Buffer.alloc(0)
  private waiter: (() => void) | null = null
  private failure: Error | null = null
  private readonly onData = (chunk: Buffer): void => {
    this.buffer = Buffer.concat([this.buffer, chunk])
    this.wake()
  }
  private readonly onEnd = (): void => {
    this.failure ??= new ProxyFailure('closed')
    this.wake()
  }
  private readonly onError = (error: Error): void => {
    this.failure ??= error
    this.wake()
  }

  constructor(private readonly socket: Socket) {
    socket.on('data', this.onData)
    socket.on('end', this.onEnd)
    socket.on('close', this.onEnd)
    socket.on('error', this.onError)
  }

  private wake(): void {
    const waiter = this.waiter
    this.waiter = null
    waiter?.()
  }

  private async waitFor(ready: () => boolean): Promise<void> {
    while (!ready()) {
      if (this.failure) throw this.failure
      await new Promise<void>((resolve) => (this.waiter = resolve))
    }
  }

  async read(n: number): Promise<Buffer> {
    await this.waitFor(() => this.buffer.length >= n)
    const out = this.buffer.subarray(0, n)
    this.buffer = this.buffer.subarray(n)
    return out
  }

  /** Lê até o delimitador (inclusive). */
  async readUntil(delimiter: string, max = 16 * 1024): Promise<Buffer> {
    const needle = Buffer.from(delimiter)
    await this.waitFor(() => {
      if (this.buffer.length > max) throw new ProxyFailure('protocol')
      return this.buffer.indexOf(needle) >= 0
    })
    const end = this.buffer.indexOf(needle) + needle.length
    const out = this.buffer.subarray(0, end)
    this.buffer = this.buffer.subarray(end)
    return out
  }

  release(): void {
    this.socket.off('data', this.onData)
    this.socket.off('end', this.onEnd)
    this.socket.off('close', this.onEnd)
    this.socket.off('error', this.onError)
    this.socket.pause()
    if (this.buffer.length > 0) this.socket.unshift(this.buffer)
    this.buffer = Buffer.alloc(0)
  }
}

export type ProxyFailureKind =
  | 'auth'
  | 'refused'
  | 'timeout'
  | 'dns'
  | 'closed'
  | 'protocol'
  | 'target'
  | 'tls'

const FAILURE_MESSAGES: Record<ProxyFailureKind, string> = {
  auth: 'O proxy recusou o usuário ou a senha.',
  refused: 'Conexão recusada pelo proxy. Confira o host, a porta e o tipo.',
  timeout: 'O proxy não respondeu a tempo.',
  dns: 'Não foi possível encontrar o host do proxy.',
  closed: 'O proxy encerrou a conexão. Confira o tipo (HTTP/SOCKS5) e as credenciais.',
  protocol: 'Resposta inesperada. O tipo de proxy selecionado pode estar errado.',
  target: 'O proxy não conseguiu acessar o site de destino.',
  tls: 'Falha na conexão segura com o proxy HTTPS.'
}

/** Falha de proxy com mensagem segura (nunca inclui credenciais). */
export class ProxyFailure extends Error {
  constructor(
    readonly kind: ProxyFailureKind,
    detail?: string
  ) {
    super(detail ?? FAILURE_MESSAGES[kind])
    this.name = 'ProxyFailure'
  }
}

export function describeProxyError(error: unknown): string {
  if (error instanceof ProxyFailure) return error.message
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ECONNREFUSED') return FAILURE_MESSAGES.refused
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return FAILURE_MESSAGES.dns
  if (code === 'ETIMEDOUT') return FAILURE_MESSAGES.timeout
  if (code === 'ECONNRESET' || code === 'EPIPE') return FAILURE_MESSAGES.closed
  if (typeof code === 'string' && code.startsWith('ERR_TLS')) return FAILURE_MESSAGES.tls
  return 'Não foi possível conectar pelo proxy.'
}

function connectToProxy(proxy: ProxyEndpoint, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket =
      proxy.type === 'https'
        ? tlsConnect({ host: proxy.host, port: proxy.port, servername: isIP(proxy.host) ? undefined : proxy.host })
        : netConnect({ host: proxy.host, port: proxy.port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new ProxyFailure('timeout'))
    }, timeoutMs)
    socket.once(proxy.type === 'https' ? 'secureConnect' : 'connect', () => {
      clearTimeout(timer)
      socket.removeListener('error', onError)
      resolve(socket)
    })
    const onError = (error: Error): void => {
      clearTimeout(timer)
      socket.destroy()
      reject(error)
    }
    socket.once('error', onError)
  })
}

async function socks5Handshake(reader: SocketReader, socket: Socket, proxy: ProxyEndpoint, host: string, port: number): Promise<void> {
  const withAuth = Boolean(proxy.username)
  socket.write(Buffer.from(withAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]))
  const [version, method] = await reader.read(2)
  if (version !== 0x05) throw new ProxyFailure('protocol')
  if (method === 0xff) throw new ProxyFailure('auth', withAuth ? undefined : 'O proxy exige usuário e senha.')
  if (method === 0x02) {
    if (!withAuth) throw new ProxyFailure('auth', 'O proxy exige usuário e senha.')
    const user = Buffer.from(proxy.username ?? '', 'utf8')
    const pass = Buffer.from(proxy.password ?? '', 'utf8')
    if (user.length > 255 || pass.length > 255) throw new ProxyFailure('auth', 'Usuário ou senha longos demais para SOCKS5.')
    socket.write(Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]))
    const [, status] = await reader.read(2)
    if (status !== 0x00) throw new ProxyFailure('auth')
  } else if (method !== 0x00) {
    throw new ProxyFailure('protocol')
  }

  let address: Buffer
  const ipVersion = isIP(host)
  if (ipVersion === 4) address = Buffer.from([0x01, ...host.split('.').map(Number)])
  else if (ipVersion === 6) address = Buffer.concat([Buffer.from([0x04]), ipv6Bytes(host)])
  else {
    const name = Buffer.from(host, 'utf8')
    if (name.length > 255) throw new ProxyFailure('target')
    address = Buffer.concat([Buffer.from([0x03, name.length]), name])
  }
  const portBytes = Buffer.from([(port >> 8) & 0xff, port & 0xff])
  socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address, portBytes]))

  const [, reply, , atyp] = await reader.read(4)
  if (reply !== 0x00) throw new ProxyFailure('target', socksReplyMessage(reply ?? 0x01))
  if (atyp === 0x01) await reader.read(4 + 2)
  else if (atyp === 0x04) await reader.read(16 + 2)
  else if (atyp === 0x03) {
    const [len] = await reader.read(1)
    await reader.read((len ?? 0) + 2)
  } else throw new ProxyFailure('protocol')
}

function socksReplyMessage(code: number): string {
  switch (code) {
    case 0x02:
      return 'O proxy não permite acessar este destino.'
    case 0x03:
    case 0x04:
      return 'O proxy não alcançou a rede ou o host de destino.'
    case 0x05:
      return 'O destino recusou a conexão feita pelo proxy.'
    case 0x06:
      return 'Tempo esgotado no proxy ao acessar o destino.'
    default:
      return 'O proxy não conseguiu acessar o site de destino.'
  }
}

function ipv6Bytes(address: string): Buffer {
  const [head = '', tail = ''] = address.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = address.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h
  return Buffer.from(groups.flatMap((g) => [(parseInt(g, 16) >> 8) & 0xff, parseInt(g, 16) & 0xff]))
}

async function httpConnectHandshake(reader: SocketReader, socket: Socket, proxy: ProxyEndpoint, host: string, port: number): Promise<void> {
  const authority = isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`
  const lines = [`CONNECT ${authority} HTTP/1.1`, `Host: ${authority}`, 'Proxy-Connection: Keep-Alive']
  if (proxy.username) {
    const token = Buffer.from(`${proxy.username}:${proxy.password ?? ''}`, 'utf8').toString('base64')
    lines.push(`Proxy-Authorization: Basic ${token}`)
  }
  socket.write(`${lines.join('\r\n')}\r\n\r\n`)
  const head = (await reader.readUntil('\r\n\r\n')).toString('latin1')
  const status = /^HTTP\/1\.[01] (\d{3})/.exec(head)
  if (!status) throw new ProxyFailure('protocol')
  const code = Number(status[1])
  if (code === 407) throw new ProxyFailure('auth', proxy.username ? undefined : 'O proxy exige usuário e senha.')
  if (code >= 300) throw new ProxyFailure('target', `O proxy respondeu ${code} ao abrir a conexão.`)
}

/**
 * Abre um túnel TCP até host:port através do proxy (SOCKS5 ou HTTP CONNECT,
 * com ou sem TLS até o proxy). O socket devolvido já está conectado ao destino.
 */
export async function openTunnel(proxy: ProxyEndpoint, host: string, port: number, timeoutMs = 15_000): Promise<Socket> {
  const socket = await connectToProxy(proxy, timeoutMs)
  const reader = new SocketReader(socket)
  const timer = setTimeout(() => socket.destroy(new ProxyFailure('timeout')), timeoutMs)
  try {
    if (proxy.type === 'socks5') await socks5Handshake(reader, socket, proxy, host, port)
    else await httpConnectHandshake(reader, socket, proxy, host, port)
    reader.release()
    return socket
  } catch (error) {
    reader.release()
    socket.destroy()
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function toAppError(error: unknown): AppError {
  return new AppError('PROXY_FAILED', describeProxyError(error))
}
