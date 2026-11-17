import type { IpcApi, IpcChannel, IpcEventName, IpcEvents, ZenxBridge } from '@shared/ipc'

declare global {
  interface Window {
    zenx: ZenxBridge
  }
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Args<K extends IpcChannel> = IpcApi[K][0] extends void ? [] : [payload: IpcApi[K][0]]

/** Chamada IPC tipada. Lança `ApiError` com mensagem pronta para exibição. */
export async function call<K extends IpcChannel>(channel: K, ...args: Args<K>): Promise<IpcApi[K][1]> {
  const result = await window.zenx.invoke(channel, args[0] as IpcApi[K][0])
  if (!result.ok) throw new ApiError(result.error.code, result.error.message)
  return result.data
}

export function subscribe<E extends IpcEventName>(
  event: E,
  listener: (payload: IpcEvents[E]) => void
): () => void {
  return window.zenx.on(event, listener)
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocorreu um erro inesperado.'
}
