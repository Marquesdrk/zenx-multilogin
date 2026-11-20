import { create } from 'zustand'
import { DEFAULT_FILTERS, type ProfileFilters } from '@shared/filters'
import type { SettingsPatch } from '@shared/schemas'
import {
  DEFAULT_SETTINGS,
  RESOURCE_WARNING_THRESHOLD,
  type AppInfo,
  type BrowserState,
  type BrowserStates,
  type ChromiumInfo,
  type EventDTO,
  type GroupDTO,
  type PageId,
  type ProfileDTO,
  type ProxyDTO,
  type Settings
} from '@shared/types'
import { call, errorMessage } from './lib/api'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'
export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface AppState {
  ready: boolean
  bootError: string | null
  page: PageId
  profiles: ProfileDTO[]
  groups: GroupDTO[]
  proxies: ProxyDTO[]
  events: EventDTO[]
  states: BrowserStates
  settings: Settings
  appInfo: AppInfo | null
  chromium: ChromiumInfo | null
  filters: ProfileFilters
  toasts: Toast[]
  profileForm: { open: boolean; editing: ProfileDTO | null }
  groupForm: { open: boolean; editing: GroupDTO | null }
  proxyForm: { open: boolean; editing: ProxyDTO | null }
  proxyImportOpen: boolean
  /** Perfil recém-criado, para oferecer a abertura imediata do navegador. */
  justCreated: ProfileDTO | null
  closePrompt: { openCount: number } | null

  init(): Promise<void>
  navigate(page: PageId): void
  refreshProfiles(): Promise<void>
  refreshGroups(): Promise<void>
  refreshProxies(): Promise<void>
  /** Substitui um proxy na lista (ex.: após verificação). */
  putProxy(proxy: ProxyDTO): void
  openProxyForm(editing?: ProxyDTO | null): void
  closeProxyForm(): void
  setProxyImportOpen(open: boolean): void
  refreshEvents(): Promise<void>
  setFilters(patch: Partial<ProfileFilters>): void
  updateSettings(patch: SettingsPatch): Promise<void>
  applyBrowserState(id: string, state: BrowserState): void
  toast(kind: ToastKind, message: string): void
  dismissToast(id: number): void
  openProfileForm(editing?: ProfileDTO | null): void
  closeProfileForm(): void
  openGroupForm(editing?: GroupDTO | null): void
  closeGroupForm(): void
  setJustCreated(profile: ProfileDTO | null): void
  setClosePrompt(prompt: { openCount: number } | null): void

  openBrowser(id: string): Promise<void>
  focusBrowser(id: string): Promise<void>
  closeBrowser(id: string): Promise<void>
  openMany(ids: string[]): Promise<void>
  closeMany(ids: string[]): Promise<void>
  closeAll(): Promise<void>
}

let toastSeq = 0
let refreshTimer: ReturnType<typeof setTimeout> | undefined

const countOpen = (states: BrowserStates): number =>
  Object.values(states).filter((s) => s.status !== 'closed' && s.status !== 'error').length

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  bootError: null,
  page: 'dashboard',
  profiles: [],
  groups: [],
  proxies: [],
  events: [],
  states: {},
  settings: DEFAULT_SETTINGS,
  appInfo: null,
  chromium: null,
  filters: DEFAULT_FILTERS,
  toasts: [],
  profileForm: { open: false, editing: null },
  groupForm: { open: false, editing: null },
  proxyForm: { open: false, editing: null },
  proxyImportOpen: false,
  justCreated: null,
  closePrompt: null,

  async init() {
    try {
      const [settings, profiles, groups, proxies, events, states, appInfo, chromium] = await Promise.all([
        call('settings:get'),
        call('profiles:list'),
        call('groups:list'),
        call('proxies:list'),
        call('events:list', { limit: 30 }),
        call('browser:states'),
        call('app:info'),
        call('chromium:info')
      ])
      set({
        settings,
        profiles,
        groups,
        proxies,
        events,
        states,
        appInfo,
        chromium,
        page: settings.reopenLastPage ? settings.lastPage : 'dashboard',
        ready: true
      })
    } catch (error) {
      set({ bootError: errorMessage(error) })
    }
  },

  navigate(page) {
    if (get().page === page) return
    set({ page })
    void call('settings:update', { lastPage: page }).catch(() => undefined)
  },

  async refreshProfiles() {
    set({ profiles: await call('profiles:list') })
  },
  async refreshGroups() {
    set({ groups: await call('groups:list') })
  },
  async refreshProxies() {
    set({ proxies: await call('proxies:list') })
  },
  putProxy(proxy) {
    set((s) => ({ proxies: s.proxies.map((p) => (p.id === proxy.id ? proxy : p)) }))
  },
  openProxyForm(editing = null) {
    set({ proxyForm: { open: true, editing } })
  },
  closeProxyForm() {
    set((s) => ({ proxyForm: { ...s.proxyForm, open: false } }))
  },
  setProxyImportOpen(open) {
    set({ proxyImportOpen: open })
  },
  async refreshEvents() {
    set({ events: await call('events:list', { limit: 30 }) })
  },

  setFilters(patch) {
    set((s) => ({ filters: { ...s.filters, ...patch } }))
  },

  async updateSettings(patch) {
    try {
      set({ settings: await call('settings:update', patch) })
    } catch (error) {
      get().toast('error', errorMessage(error))
    }
  },

  applyBrowserState(id, state) {
    const before = countOpen(get().states)
    set((s) => {
      const states = { ...s.states }
      if (state.status === 'closed') delete states[id]
      else states[id] = state
      return { states }
    })
    const after = countOpen(get().states)
    if (
      get().settings.showResourceWarnings &&
      before < RESOURCE_WARNING_THRESHOLD &&
      after >= RESOURCE_WARNING_THRESHOLD
    ) {
      get().toast(
        'warning',
        `${after} navegadores abertos. Muitos navegadores simultâneos aumentam o consumo de memória e CPU.`
      )
    }
    // Abertura/encerramento alteram "última abertura" e a atividade recente.
    if (state.status === 'open' || state.status === 'closed' || state.status === 'error') {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        void get().refreshProfiles().catch(() => undefined)
        void get().refreshEvents().catch(() => undefined)
      }, 250)
    }
  },

  toast(kind, message) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' || kind === 'warning' ? 7000 : 3800)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  openProfileForm(editing = null) {
    set({ profileForm: { open: true, editing } })
  },
  closeProfileForm() {
    set((s) => ({ profileForm: { ...s.profileForm, open: false } }))
  },
  openGroupForm(editing = null) {
    set({ groupForm: { open: true, editing } })
  },
  closeGroupForm() {
    set((s) => ({ groupForm: { ...s.groupForm, open: false } }))
  },
  setJustCreated(profile) {
    set({ justCreated: profile })
  },
  setClosePrompt(prompt) {
    set({ closePrompt: prompt })
  },

  async openBrowser(id) {
    const status = get().states[id]?.status ?? 'closed'
    // Proteção contra cliques repetidos: ignora enquanto inicia ou encerra.
    if (status === 'starting' || status === 'closing') return
    try {
      await call('browser:open', { id })
    } catch (error) {
      get().toast('error', errorMessage(error))
    }
  },
  async focusBrowser(id) {
    try {
      await call('browser:focus', { id })
    } catch (error) {
      get().toast('error', errorMessage(error))
    }
  },
  async closeBrowser(id) {
    try {
      await call('browser:close', { id })
    } catch (error) {
      get().toast('error', errorMessage(error))
    }
  },
  async openMany(ids) {
    if (ids.length === 0) return
    try {
      await call('browser:openMany', { ids })
    } catch (error) {
      get().toast('error', errorMessage(error))
    }
  },
  async closeMany(ids) {
    if (ids.length === 0) return
    try {
      await call('browser:closeMany', { ids })
    } catch (error) {
      get().toast('error', errorMessage(error))
    }
  },
  async closeAll() {
    try {
      await call('browser:closeAll')
      get().toast('success', 'Todos os navegadores foram encerrados.')
    } catch (error) {
      get().toast('error', errorMessage(error))
    }
  }
}))

export const selectOpenCount = (s: AppState): number => countOpen(s.states)
