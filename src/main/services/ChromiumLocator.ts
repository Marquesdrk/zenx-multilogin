import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { AppError } from '@shared/errors'
import type { ChromiumInfo } from '@shared/types'
import { assertInside } from '../paths'

const manifestSchema = z.object({
  version: z.string().min(1),
  revision: z.string().min(1),
  executable: z.string().min(1),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
})
type Manifest = z.infer<typeof manifestSchema>

/**
 * Localiza e verifica o Chromium gerenciado distribuído com o aplicativo.
 * Nunca usa o Chrome instalado no Windows nem um caminho fixo do sistema.
 */
export class ChromiumLocator {
  constructor(private readonly root: string) {}

  private async readManifest(): Promise<Manifest | null> {
    try {
      const raw = await readFile(join(this.root, 'manifest.json'), 'utf8')
      return manifestSchema.parse(JSON.parse(raw))
    } catch {
      return null
    }
  }

  private executableOf(manifest: Manifest): string {
    const file = resolve(this.root, manifest.executable)
    assertInside(this.root, file)
    return file
  }

  /** Verificação rápida (existência e tamanho) usada a cada abertura. */
  async requireExecutable(): Promise<string> {
    const info = await this.info(false)
    if (!info.installed || !info.executablePath) throw new AppError('CHROMIUM_MISSING', info.message)
    await this.ensureSandboxAccess()
    return info.executablePath
  }

  private sandboxAccess: Promise<void> | null = null

  /**
   * O sandbox do Chromium no Windows executa processos em AppContainer, que precisam
   * de leitura na pasta do navegador. O instalador do Google Chrome concede essa
   * permissão; aqui fazemos o mesmo para a pasta do Chromium gerenciado (pertencente
   * ao usuário). Sem isso o serviço de rede do Chromium falha e as páginas não carregam.
   * Mantém o sandbox ativo, em vez de desativá-lo.
   */
  private ensureSandboxAccess(): Promise<void> {
    if (process.platform !== 'win32') return Promise.resolve()
    this.sandboxAccess ??= new Promise<void>((resolve) => {
      execFile(
        'icacls',
        [this.root, '/grant', '*S-1-15-2-1:(OI)(CI)(RX)', '*S-1-15-2-2:(OI)(CI)(RX)', '/Q'],
        { windowsHide: true, timeout: 60_000 },
        (error) => {
          if (error) console.error('[ChromiumLocator] não foi possível ajustar permissões do sandbox')
          resolve()
        }
      )
    })
    return this.sandboxAccess
  }

  /** `deep` recalcula o SHA-256 do executável e compara com o manifesto. */
  async info(deep: boolean): Promise<ChromiumInfo> {
    const manifest = await this.readManifest()
    if (!manifest) {
      return {
        installed: false,
        version: null,
        executablePath: null,
        integrity: 'missing',
        message: 'Chromium gerenciado não encontrado. Reinstale o Zenx MultiLogin.'
      }
    }
    const executablePath = this.executableOf(manifest)
    const base = { version: manifest.version, executablePath }
    try {
      const file = await stat(executablePath)
      if (!file.isFile() || file.size !== manifest.size) {
        return {
          ...base,
          installed: false,
          integrity: 'mismatch',
          message: 'O executável do Chromium está corrompido. Reinstale o Zenx MultiLogin.'
        }
      }
    } catch {
      return {
        ...base,
        installed: false,
        integrity: 'missing',
        message: 'O executável do Chromium não foi encontrado. Reinstale o Zenx MultiLogin.'
      }
    }
    if (!deep) {
      return { ...base, installed: true, integrity: 'not_checked', message: 'Chromium instalado.' }
    }
    const hash = await sha256(executablePath)
    return hash === manifest.sha256
      ? { ...base, installed: true, integrity: 'ok', message: 'Chromium instalado e íntegro.' }
      : {
          ...base,
          installed: false,
          integrity: 'mismatch',
          message: 'A verificação de integridade do Chromium falhou. Reinstale o Zenx MultiLogin.'
        }
  }
}

function sha256(file: string): Promise<string> {
  return new Promise((ok, fail) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => ok(hash.digest('hex')))
      .on('error', fail)
  })
}
