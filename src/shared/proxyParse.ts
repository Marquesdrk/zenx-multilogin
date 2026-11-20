import { PROXY_TYPES, type ProxyType } from './types'

export interface ParsedProxy {
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
}

const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/

function toPort(value: string | undefined): number | null {
  if (!value || !/^\d{1,5}$/.test(value)) return null
  const port = Number(value)
  return port >= 1 && port <= 65535 ? port : null
}

function schemeToType(scheme: string): ProxyType | null {
  const s = scheme.toLowerCase()
  if (s === 'socks5h' || s === 'socks') return 'socks5'
  return (PROXY_TYPES as readonly string[]).includes(s) ? (s as ProxyType) : null
}

/**
 * Interpreta uma linha de proxy nos formatos mais comuns dos provedores:
 *   host:porta
 *   host:porta:usuário:senha
 *   usuário:senha@host:porta
 *   tipo://usuário:senha@host:porta   (http, https, socks5, socks5h)
 * Retorna null quando a linha não é um proxy válido.
 */
export function parseProxyLine(line: string, defaultType: ProxyType = 'http'): ParsedProxy | null {
  let rest = line.trim()
  if (!rest || rest.startsWith('#')) return null
  let type = defaultType

  const scheme = /^([a-z0-9]+):\/\//i.exec(rest)
  if (scheme) {
    const parsed = schemeToType(scheme[1] as string)
    if (!parsed) return null
    type = parsed
    rest = rest.slice(scheme[0].length).replace(/\/+$/, '')
  }

  let username = ''
  let password = ''
  let hostPort = rest
  const at = rest.lastIndexOf('@')
  if (at >= 0) {
    const auth = rest.slice(0, at)
    hostPort = rest.slice(at + 1)
    const colon = auth.indexOf(':')
    username = decodeSafe(colon >= 0 ? auth.slice(0, colon) : auth)
    password = decodeSafe(colon >= 0 ? auth.slice(colon + 1) : '')
  }

  const parts = hostPort.split(':')
  if (at < 0 && parts.length >= 4) {
    // host:porta:usuário:senha (a senha pode conter ':')
    username = parts[2] as string
    password = parts.slice(3).join(':')
  } else if (parts.length !== 2) {
    return null
  }
  const host = (parts[0] ?? '').trim()
  const port = toPort(parts[1]?.trim())
  if (!HOST.test(host) || host.length > 253 || port === null) return null
  return { type, host, port, username, password }
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Nome padrão exibido para um proxy sem nome. */
export const proxyDefaultName = (host: string, port: number): string => `${host}:${port}`
