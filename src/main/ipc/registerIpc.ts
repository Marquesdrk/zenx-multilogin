import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { AppError } from '@shared/errors'
import type { IpcApi, IpcChannel, IpcResult } from '@shared/ipc'
import {
  groupInputSchema,
  idPayloadSchema,
  idSchema,
  idsPayloadSchema,
  profileInputSchema,
  settingsPatchSchema
} from '@shared/schemas'

type Handler<K extends IpcChannel> = (input: IpcApi[K][0]) => Promise<IpcApi[K][1]> | IpcApi[K][1]
export type IpcHandlers = { [K in IpcChannel]: Handler<K> }

const none = z.undefined().or(z.null()).transform(() => undefined)

/** Validação Zod da entrada de cada canal. Toda mensagem do renderer passa por aqui. */
const inputSchemas: { [K in IpcChannel]: z.ZodType<IpcApi[K][0]> } = {
  'profiles:list': none,
  'profiles:create': profileInputSchema,
  'profiles:update': z.object({ id: idSchema, data: profileInputSchema }),
  'profiles:delete': idPayloadSchema,
  'profiles:duplicate': idPayloadSchema,
  'groups:list': none,
  'groups:create': groupInputSchema,
  'groups:update': z.object({ id: idSchema, data: groupInputSchema }),
  'groups:delete': idPayloadSchema,
  'tags:list': none,
  'events:list': z.object({ limit: z.number().int().min(1).max(200) }),
  'browser:states': none,
  'browser:open': idPayloadSchema,
  'browser:focus': idPayloadSchema,
  'browser:close': idPayloadSchema,
  'browser:openMany': idsPayloadSchema,
  'browser:closeMany': idsPayloadSchema,
  'browser:closeAll': none,
  'chromium:verify': none,
  'chromium:info': none,
  'settings:get': none,
  'settings:update': settingsPatchSchema,
  'app:info': none,
  'app:openDataDir': none,
  'app:confirmQuit': none,
  'window:minimize': none,
  'window:toggleMaximize': none,
  'window:isMaximized': none,
  'window:close': none
}

function toIpcError(error: unknown): IpcResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message } }
  }
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Dados inválidos.'
    return { ok: false, error: { code: 'VALIDATION', message } }
  }
  console.error('[ipc] erro inesperado:', error instanceof Error ? error.message : 'desconhecido')
  return { ok: false, error: { code: 'INTERNAL', message: 'Ocorreu um erro interno. Tente novamente.' } }
}

/**
 * Registra os handlers IPC. `isTrustedSender` garante que só o frame principal
 * do painel (carregado dos arquivos locais do app) consiga invocar os canais.
 */
export function registerIpc(
  handlers: IpcHandlers,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  for (const channel of Object.keys(inputSchemas) as IpcChannel[]) {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<unknown>> => {
      if (!isTrustedSender(event)) {
        return { ok: false, error: { code: 'FORBIDDEN', message: 'Origem não autorizada.' } }
      }
      try {
        const input = inputSchemas[channel].parse(payload)
        const handler = handlers[channel] as (input: unknown) => unknown
        return { ok: true, data: await handler(input) }
      } catch (error) {
        return toIpcError(error)
      }
    })
  }
}
