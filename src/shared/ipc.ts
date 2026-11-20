/**
 * Contrato IPC entre o renderer (React) e o processo principal.
 * Este arquivo não importa Zod nem módulos Node: é seguro para o preload em sandbox.
 */
import type { GroupInput, ProfileInput, ProxyImport, ProxyInput, SettingsPatch } from './schemas'
import type {
  AppInfo,
  BrowserState,
  BrowserStates,
  ChangeIpResult,
  ChromiumInfo,
  EventDTO,
  GroupDTO,
  ProfileDTO,
  ProxyCheck,
  ProxyDTO,
  ProxyImportResult,
  Settings,
  TagDTO
} from './types'

/** canal -> [entrada, saída] */
export interface IpcApi {
  'profiles:list': [void, ProfileDTO[]]
  'profiles:create': [ProfileInput, ProfileDTO]
  'profiles:update': [{ id: string; data: ProfileInput }, ProfileDTO]
  'profiles:delete': [{ id: string }, void]
  'profiles:duplicate': [{ id: string }, ProfileDTO]
  'groups:list': [void, GroupDTO[]]
  'groups:create': [GroupInput, GroupDTO]
  'groups:update': [{ id: string; data: GroupInput }, GroupDTO]
  'groups:delete': [{ id: string }, void]
  'tags:list': [void, TagDTO[]]
  'proxies:list': [void, ProxyDTO[]]
  'proxies:create': [ProxyInput, ProxyDTO]
  'proxies:update': [{ id: string; data: ProxyInput }, ProxyDTO]
  'proxies:delete': [{ id: string }, void]
  'proxies:import': [ProxyImport, ProxyImportResult]
  'proxies:check': [{ id: string }, ProxyDTO]
  'proxies:test': [{ data: ProxyInput; id: string | null }, ProxyCheck]
  'proxies:changeIp': [{ id: string }, ChangeIpResult]
  'events:list': [{ limit: number }, EventDTO[]]
  'browser:states': [void, BrowserStates]
  'browser:open': [{ id: string }, BrowserState]
  'browser:focus': [{ id: string }, void]
  'browser:close': [{ id: string }, void]
  'browser:openMany': [{ ids: string[] }, void]
  'browser:closeMany': [{ ids: string[] }, void]
  'browser:closeAll': [void, void]
  'chromium:verify': [void, ChromiumInfo]
  'chromium:info': [void, ChromiumInfo]
  'settings:get': [void, Settings]
  'settings:update': [SettingsPatch, Settings]
  'app:info': [void, AppInfo]
  'app:openDataDir': [void, void]
  'app:confirmQuit': [void, void]
  'window:minimize': [void, void]
  'window:toggleMaximize': [void, boolean]
  'window:isMaximized': [void, boolean]
  'window:close': [void, void]
}

export type IpcChannel = keyof IpcApi

export const IPC_CHANNELS = [
  'profiles:list',
  'profiles:create',
  'profiles:update',
  'profiles:delete',
  'profiles:duplicate',
  'groups:list',
  'groups:create',
  'groups:update',
  'groups:delete',
  'tags:list',
  'proxies:list',
  'proxies:create',
  'proxies:update',
  'proxies:delete',
  'proxies:import',
  'proxies:check',
  'proxies:test',
  'proxies:changeIp',
  'events:list',
  'browser:states',
  'browser:open',
  'browser:focus',
  'browser:close',
  'browser:openMany',
  'browser:closeMany',
  'browser:closeAll',
  'chromium:verify',
  'chromium:info',
  'settings:get',
  'settings:update',
  'app:info',
  'app:openDataDir',
  'app:confirmQuit',
  'window:minimize',
  'window:toggleMaximize',
  'window:isMaximized',
  'window:close'
] as const satisfies readonly IpcChannel[]

/** Eventos enviados do processo principal para o renderer. */
export interface IpcEvents {
  'browser:state': { id: string; state: BrowserState }
  'window:maximized': boolean
  'app:closeRequested': { openCount: number }
}
export type IpcEventName = keyof IpcEvents
export const IPC_EVENTS = [
  'browser:state',
  'window:maximized',
  'app:closeRequested'
] as const satisfies readonly IpcEventName[]

export interface IpcError {
  code: string
  message: string
}
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/** API exposta em `window.zenx` pelo preload. */
export interface ZenxBridge {
  invoke<K extends IpcChannel>(channel: K, payload: IpcApi[K][0]): Promise<IpcResult<IpcApi[K][1]>>
  on<E extends IpcEventName>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
}
