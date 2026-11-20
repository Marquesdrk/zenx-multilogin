export type AppErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'BUSY'
  | 'LIMIT_REACHED'
  | 'CHROMIUM_MISSING'
  | 'LAUNCH_FAILED'
  | 'PROXY_FAILED'
  | 'FORBIDDEN'
  | 'INTERNAL'

/** Erro de domínio com mensagem segura para exibir ao usuário. */
export class AppError extends Error {
  readonly code: AppErrorCode
  constructor(code: AppErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}
