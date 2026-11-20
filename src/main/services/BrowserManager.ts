import { execFile, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { AppError } from '@shared/errors'
import type { BrowserState, BrowserStates, EventType } from '@shared/types'
import { assertUuid } from '../paths'
import { ProxyBridge } from '../proxy/bridge'
import type { ProxyEndpoint } from '../proxy/tunnel'
import { prepareRegion, type RegionConfig } from '../region/region'

/** Processo de navegador em execução. */
export interface BrowserProcess {
  readonly pid: number
  readonly exited: boolean
  onExit(listener: () => void): void
  /** Encerramento gracioso (preserva cookies e armazenamento); força se não responder. */
  close(): Promise<void>
  /** Traz a janela para o primeiro plano. */
  focus(): Promise<void>
}

export interface LaunchRequest {
  executablePath: string
  userDataDir: string
  url: string | null
  extraArgs: readonly string[]
}

/** Inicia um Chromium. Injetável para testes. */
export type BrowserLauncher = (request: LaunchRequest) => Promise<BrowserProcess>

export interface BrowserManagerDeps {
  getProfile(
    id: string
  ): Promise<{ id: string; name: string; homeUrl: string | null; proxyId?: string | null } | null>
  /** Credenciais do proxy (somente em memória). Sem esta função, perfis abrem sem proxy. */
  resolveProxy?(proxyId: string): Promise<ProxyEndpoint>
  /** Fuso, idioma e geolocalização do perfil. Nulo = os do computador. */
  resolveRegion?(profileId: string): Promise<RegionConfig | null>
  resolveUserDataDir(id: string): string
  resolveExecutable(): Promise<string>
  getMaxOpen(): Promise<number>
  markOpened(id: string): Promise<void>
  logEvent(type: EventType, message: string, profileId: string | null): Promise<void>
  launcher?: BrowserLauncher
  /** Argumentos extras do Chromium. Usado apenas pelos testes (ex.: posição da janela). */
  extraArgs?: readonly string[]
  /** Protocolos aceitos para a URL inicial. Padrão: somente https. */
  allowedProtocols?: readonly string[]
  /** Quantos Chromium podem estar inicializando ao mesmo tempo. */
  launchConcurrency?: number
}

interface Entry {
  state: BrowserState
  process?: BrowserProcess
  starting?: Promise<BrowserState>
  closed?: boolean
  bridge?: ProxyBridge
}

const CLOSED: BrowserState = { status: 'closed' }
const STARTUP_GRACE_MS = 1200
const isWindows = process.platform === 'win32'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function run(file: string, args: string[], timeout = 15_000): Promise<number> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout }, (error) => {
      resolve(error ? 1 : 0)
    })
  })
}

/** Script PowerShell que restaura e traz para frente a janela principal de um processo. */
function focusScript(pid: number): string {
  return `
$ErrorActionPreference = 'Stop'
$h = (Get-Process -Id ${pid}).MainWindowHandle
if ($h -eq 0) { exit 2 }
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class ZenxWindow {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, int f, int e);
}
"@
if ([ZenxWindow]::IsIconic($h)) { [ZenxWindow]::ShowWindowAsync($h, 9) | Out-Null }
[ZenxWindow]::keybd_event(0x12, 0, 0, 0); [ZenxWindow]::keybd_event(0x12, 0, 2, 0)
[ZenxWindow]::SetForegroundWindow($h) | Out-Null
`
}

/**
 * Argumentos de proxy do Chromium. Proxies com usuário e senha passam por uma
 * ponte SOCKS5 local (o Chromium não aceita credenciais na linha de comando).
 */
export async function proxyLaunchArgs(proxy: ProxyEndpoint): Promise<{ args: string[]; bridge?: ProxyBridge }> {
  let server: string
  let proxyHost: string
  let bridge: ProxyBridge | undefined
  if (proxy.username) {
    bridge = new ProxyBridge(proxy)
    const port = await bridge.start()
    server = `socks5://127.0.0.1:${port}`
    proxyHost = '127.0.0.1'
  } else {
    server = `${proxy.type}://${proxy.host}:${proxy.port}`
    proxyHost = proxy.host
  }
  return {
    bridge,
    args: [
      `--proxy-server=${server}`,
      // Nomes são resolvidos pelo proxy, nunca pelo DNS local (evita vazamento de DNS).
      `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${proxyHost}`,
      // WebRTC não pode usar UDP fora do proxy (evita vazamento do IP real).
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
    ]
  }
}

/**
 * Inicia o Chromium gerenciado como um navegador comum, operado pelo usuário.
 * Não há protocolo de depuração, pipe de automação nem `--enable-automation`:
 * o navegador não é controlado remotamente, por isso sites como o login do Google
 * o tratam como um navegador normal. Os argumentos são passados sem shell.
 */
export const nativeLauncher: BrowserLauncher = async ({ executablePath, userDataDir, url, extraArgs }) => {
  const args = [
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...extraArgs,
    ...(url ? [url] : [])
  ]
  const child = spawn(executablePath, args, { stdio: 'ignore', windowsHide: false })
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  const pid = child.pid as number
  let exited = false
  const exitListeners: (() => void)[] = []
  const exitPromise = new Promise<void>((resolve) => {
    child.once('exit', () => {
      exited = true
      resolve()
      for (const listener of exitListeners) listener()
    })
  })

  // Se o processo terminar logo após iniciar, a inicialização falhou
  // (ou outra janela já está usando este diretório de perfil).
  await Promise.race([exitPromise, delay(STARTUP_GRACE_MS)])
  if (exited) {
    throw new AppError(
      'LAUNCH_FAILED',
      'O Chromium encerrou ao iniciar. Se este perfil já estiver aberto em outra janela, feche-a e tente novamente.'
    )
  }

  return {
    pid,
    get exited() {
      return exited
    },
    onExit(listener) {
      if (exited) listener()
      else exitListeners.push(listener)
    },
    async close() {
      if (exited) return
      if (isWindows) {
        // Sem /F: o Windows envia WM_CLOSE e o Chromium encerra normalmente, gravando a sessão.
        await run('taskkill', ['/PID', String(pid)])
      } else {
        child.kill('SIGTERM')
      }
      await Promise.race([exitPromise, delay(10_000)])
      if (exited) return
      if (isWindows) await run('taskkill', ['/PID', String(pid), '/T', '/F'])
      else child.kill('SIGKILL')
      await Promise.race([exitPromise, delay(5_000)])
    },
    async focus() {
      if (exited) throw new AppError('NOT_FOUND', 'O navegador deste perfil não está aberto.')
      if (!isWindows) return
      const encoded = Buffer.from(focusScript(pid), 'utf16le').toString('base64')
      const code = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
      if (code !== 0) throw new AppError('INTERNAL', 'Não foi possível focar a janela do navegador.')
    }
  }
}

/**
 * Controla uma instância Chromium real e independente por perfil.
 * Eventos: 'state' (id: string, state: BrowserState).
 */
export class BrowserManager extends EventEmitter {
  private readonly entries = new Map<string, Entry>()
  private readonly launcher: BrowserLauncher
  private readonly extraArgs: readonly string[]
  private readonly allowedProtocols: readonly string[]
  private readonly launchConcurrency: number
  private launching = 0
  private readonly waiters: (() => void)[] = []

  constructor(private readonly deps: BrowserManagerDeps) {
    super()
    this.launcher = deps.launcher ?? nativeLauncher
    this.extraArgs = deps.extraArgs ?? []
    this.allowedProtocols = deps.allowedProtocols ?? ['https:']
    this.launchConcurrency = Math.max(1, deps.launchConcurrency ?? 2)
  }

  getState(id: string): BrowserState {
    return this.entries.get(id)?.state ?? CLOSED
  }

  getStates(): BrowserStates {
    const out: BrowserStates = {}
    for (const [id, entry] of this.entries) out[id] = entry.state
    return out
  }

  /** Navegadores que ocupam recursos: iniciando, abertos ou encerrando. */
  activeCount(): number {
    let total = 0
    for (const entry of this.entries.values()) if (entry.state.status !== 'error') total++
    return total
  }

  /** Uso exclusivo dos testes automatizados. */
  pidForTesting(id: string): number | undefined {
    return this.entries.get(id)?.process?.pid
  }

  /**
   * Abre o navegador do perfil. Se já estiver aberto, apenas foca a janela;
   * se estiver iniciando, devolve a mesma inicialização em andamento.
   */
  open(id: string): Promise<BrowserState> {
    try {
      assertUuid(id)
    } catch (error) {
      return Promise.reject(error)
    }
    const current = this.entries.get(id)
    if (current?.state.status === 'open') {
      return this.focus(id)
        .catch(() => undefined)
        .then(() => this.getState(id))
    }
    if (current?.state.status === 'starting' && current.starting) return current.starting
    if (current?.state.status === 'closing') {
      return Promise.reject(new AppError('BUSY', 'O navegador deste perfil ainda está encerrando.'))
    }

    // Reserva síncrona: a partir daqui nenhuma outra chamada inicia este perfil.
    const entry: Entry = { state: { status: 'starting' } }
    this.entries.set(id, entry)
    this.emitState(id)
    entry.starting = this.launch(id, entry)
    return entry.starting
  }

  private async launch(id: string, entry: Entry): Promise<BrowserState> {
    let name = 'perfil'
    try {
      const profile = await this.deps.getProfile(id)
      if (!profile) throw new AppError('NOT_FOUND', 'Perfil não encontrado.')
      name = profile.name

      const max = await this.deps.getMaxOpen()
      if (this.activeCount() > max) {
        throw new AppError(
          'LIMIT_REACHED',
          `Limite de ${max} navegadores simultâneos atingido. Feche um navegador ou aumente o limite nas configurações.`
        )
      }

      const url = this.resolveStartUrl(profile.homeUrl)
      const userDataDir = this.deps.resolveUserDataDir(id)
      await mkdir(userDataDir, { recursive: true })
      const executablePath = await this.deps.resolveExecutable()

      let proxyArgs: string[] = []
      if (profile.proxyId && this.deps.resolveProxy) {
        const proxy = await this.deps.resolveProxy(profile.proxyId)
        const built = await proxyLaunchArgs(proxy)
        proxyArgs = built.args
        entry.bridge = built.bridge
      }
      const region = this.deps.resolveRegion ? await this.deps.resolveRegion(id) : null
      const regionArgs = await prepareRegion(userDataDir, region)

      await this.acquireSlot()
      try {
        entry.process = await this.launcher({
          executablePath,
          userDataDir,
          url,
          extraArgs: [...this.extraArgs, ...proxyArgs, ...regionArgs]
        })
      } finally {
        this.releaseSlot()
      }
      entry.process.onExit(() => this.handleClosed(id, entry, name))
      if (entry.closed) throw new AppError('LAUNCH_FAILED', 'O navegador foi fechado durante a inicialização.')

      entry.state = { status: 'open' }
      entry.starting = undefined
      this.emitState(id)
      await this.deps.markOpened(id)
      await this.deps.logEvent('browser_started', `Navegador de "${name}" iniciado`, id)
      return entry.state
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError('LAUNCH_FAILED', 'Não foi possível iniciar o Chromium deste perfil. Tente novamente.')
      if (!(error instanceof AppError)) {
        console.error('[BrowserManager] falha ao iniciar:', firstLine(error))
      }
      const running = entry.process
      entry.closed = true
      void entry.bridge?.stop()
      // Limite atingido ou perfil inexistente não são falhas do navegador:
      // o perfil simplesmente volta a "Fechado".
      if (appError.code === 'LIMIT_REACHED' || appError.code === 'NOT_FOUND') {
        this.entries.delete(id)
        this.emitState(id)
        throw appError
      }
      // Libera a reserva e mantém apenas o estado de erro, permitindo nova tentativa.
      this.entries.set(id, { state: { status: 'error', error: appError.message } })
      this.emitState(id)
      if (running) await running.close().catch(() => undefined)
      await this.deps.logEvent('browser_failed', `Falha ao iniciar o navegador de "${name}"`, id)
      throw appError
    }
  }

  /** Traz a janela existente do perfil para o primeiro plano. */
  async focus(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry?.process || entry.state.status !== 'open') {
      throw new AppError('NOT_FOUND', 'O navegador deste perfil não está aberto.')
    }
    await entry.process.focus()
  }

  /** Encerra o navegador do perfil preservando o diretório de dados. */
  async close(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.state.status === 'error') {
      this.entries.delete(id)
      this.emitState(id)
      return
    }
    if (entry.state.status === 'starting' && entry.starting) {
      await entry.starting.catch(() => undefined)
      return this.close(id)
    }
    if (!entry.process || entry.closed) return
    if (entry.state.status !== 'closing') {
      entry.state = { status: 'closing' }
      this.emitState(id)
    }
    await entry.process.close().catch(() => undefined)
    // Garante a liberação mesmo que o término não tenha sido detectado.
    this.handleClosed(id, entry, null)
  }

  async closeMany(ids: readonly string[]): Promise<void> {
    await Promise.allSettled(ids.map((id) => this.close(id)))
  }

  async closeAll(): Promise<void> {
    await this.closeMany([...this.entries.keys()])
  }

  private handleClosed(id: string, entry: Entry, name: string | null): void {
    if (entry.closed) return
    entry.closed = true
    void entry.bridge?.stop()
    if (this.entries.get(id) === entry) {
      this.entries.delete(id)
      this.emitState(id)
    }
    if (name !== null) {
      void this.deps.logEvent('browser_closed', `Navegador de "${name}" encerrado`, id)
    } else {
      void this.deps
        .getProfile(id)
        .then((p) =>
          this.deps.logEvent('browser_closed', `Navegador de "${p?.name ?? 'perfil'}" encerrado`, p ? id : null)
        )
        .catch(() => undefined)
    }
  }

  private resolveStartUrl(homeUrl: string | null): string | null {
    if (!homeUrl) return null
    let parsed: URL
    try {
      parsed = new URL(homeUrl)
    } catch {
      throw new AppError('VALIDATION', 'A URL inicial do perfil é inválida.')
    }
    if (!this.allowedProtocols.includes(parsed.protocol)) {
      throw new AppError('VALIDATION', 'A URL inicial do perfil precisa usar HTTPS.')
    }
    return parsed.href
  }

  private emitState(id: string): void {
    this.emit('state', id, this.getState(id))
  }

  private async acquireSlot(): Promise<void> {
    if (this.launching < this.launchConcurrency) {
      this.launching++
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  private releaseSlot(): void {
    const next = this.waiters.shift()
    if (next) next()
    else this.launching--
  }
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n')[0] ?? 'erro desconhecido'
}
