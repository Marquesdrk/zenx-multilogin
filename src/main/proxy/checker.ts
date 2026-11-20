import type { Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { ProxyCheck } from '@shared/types'
import { describeProxyError, openTunnel, ProxyFailure, type ProxyEndpoint } from './tunnel'

interface Location {
  ip: string | null
  country: string | null
  region: string | null
  city: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
}

const coord = (value: unknown, limit: number): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}
const zone = (value: unknown): string | null => {
  const v = str(value)
  if (!v) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v })
    return v
  } catch {
    return null
  }
}

/** Serviço público que informa o IP de saída e a localização. */
export interface IpLookupEndpoint {
  host: string
  port: number
  tls: boolean
  path: string
  parse(body: unknown): Location | null
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null)

export const DEFAULT_LOOKUPS: readonly IpLookupEndpoint[] = [
  {
    host: 'ipinfo.io',
    port: 443,
    tls: true,
    path: '/json',
    parse: (b) => {
      const o = b as Record<string, unknown>
      const ip = str(o.ip)
      const [lat, lon] = (str(o.loc) ?? '').split(',')
      return ip
        ? {
            ip,
            country: str(o.country),
            region: str(o.region),
            city: str(o.city),
            timezone: zone(o.timezone),
            latitude: coord(lat, 90),
            longitude: coord(lon, 180)
          }
        : null
    }
  },
  {
    host: 'ipwho.is',
    port: 443,
    tls: true,
    path: '/',
    parse: (b) => {
      const o = b as Record<string, unknown>
      const ip = str(o.ip)
      return o.success !== false && ip
        ? {
            ip,
            country: str(o.country_code),
            region: str(o.region),
            city: str(o.city),
            timezone: zone((o.timezone as Record<string, unknown> | undefined)?.id),
            latitude: coord(o.latitude, 90),
            longitude: coord(o.longitude, 180)
          }
        : null
    }
  }
]

/** Requisição HTTP/1.0 simples sobre um socket já tunelado (sem chunked, termina ao fechar). */
function httpGet(socket: Socket, endpoint: IpLookupEndpoint, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const stream: Socket = endpoint.tls ? tlsConnect({ socket, servername: endpoint.host }) : socket
    const chunks: Buffer[] = []
    let size = 0
    const timer = setTimeout(() => {
      stream.destroy()
      reject(new ProxyFailure('timeout'))
    }, timeoutMs)
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        stream.destroy()
        return
      }
      chunks.push(chunk)
    })
    stream.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    stream.once('close', () => {
      clearTimeout(timer)
      const raw = Buffer.concat(chunks).toString('utf8')
      const split = raw.indexOf('\r\n\r\n')
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(raw)
      if (split < 0 || !status) return reject(new ProxyFailure('target'))
      if (status[1] !== '200') return reject(new ProxyFailure('target', `Serviço de verificação respondeu ${status[1]}.`))
      try {
        resolve(JSON.parse(raw.slice(split + 4)))
      } catch {
        reject(new ProxyFailure('target'))
      }
    })
    const send = (): void => {
      stream.write(
        `GET ${endpoint.path} HTTP/1.0\r\nHost: ${endpoint.host}\r\nAccept: application/json\r\nUser-Agent: ZenxMultiLogin\r\nConnection: close\r\n\r\n`
      )
    }
    if (endpoint.tls) stream.once('secureConnect', send)
    else send()
    socket.resume()
  })
}

/**
 * Verifica o proxy: abre um túnel até um serviço de IP público e lê o IP de saída
 * e a localização. A requisição sai pelo proxy, nunca pela conexão local.
 */
export async function checkProxy(
  proxy: ProxyEndpoint,
  lookups: readonly IpLookupEndpoint[] = DEFAULT_LOOKUPS,
  timeoutMs = 15_000
): Promise<ProxyCheck> {
  const checkedAt = Date.now()
  let lastError: unknown = null
  for (const endpoint of lookups) {
    const started = Date.now()
    let socket: Socket
    try {
      socket = await openTunnel(proxy, endpoint.host, endpoint.port, timeoutMs)
    } catch (error) {
      // Falha no próprio proxy: outro serviço não mudaria o resultado.
      return failed(checkedAt, error)
    }
    const latencyMs = Date.now() - started
    try {
      const location = endpoint.parse(await httpGet(socket, endpoint, timeoutMs))
      if (location) return { ok: true, checkedAt, latencyMs, error: null, ...location }
      lastError = new ProxyFailure('target')
    } catch (error) {
      lastError = error
    } finally {
      socket.destroy()
    }
  }
  return failed(checkedAt, lastError)
}

function failed(checkedAt: number, error: unknown): ProxyCheck {
  return {
    ok: false,
    checkedAt,
    ip: null,
    country: null,
    region: null,
    city: null,
    timezone: null,
    latitude: null,
    longitude: null,
    latencyMs: null,
    error: describeProxyError(error)
  }
}
