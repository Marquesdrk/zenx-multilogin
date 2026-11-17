import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS, type ZenxBridge } from '@shared/ipc'

const channels = new Set<string>(IPC_CHANNELS)
const events = new Set<string>(IPC_EVENTS)

/**
 * Ponte mínima: o renderer só consegue chamar canais da lista permitida.
 * Nenhuma API do Node ou do Electron é exposta diretamente ao React.
 */
const bridge: ZenxBridge = {
  invoke(channel, payload) {
    if (!channels.has(channel)) {
      return Promise.resolve({ ok: false, error: { code: 'FORBIDDEN', message: 'Canal não permitido.' } })
    }
    return ipcRenderer.invoke(channel, payload)
  },
  on(event, listener) {
    if (!events.has(event)) return () => undefined
    const handler = (_e: IpcRendererEvent, payload: unknown): void => listener(payload as never)
    ipcRenderer.on(event, handler)
    return () => {
      ipcRenderer.removeListener(event, handler)
    }
  }
}

contextBridge.exposeInMainWorld('zenx', Object.freeze(bridge))
