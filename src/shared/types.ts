export const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'x', 'youtube', 'other'] as const
export type Platform = (typeof PLATFORMS)[number]

export const PLATFORM_META: Record<Platform, { label: string; url: string }> = {
  instagram: { label: 'Instagram', url: 'https://www.instagram.com/' },
  tiktok: { label: 'TikTok', url: 'https://www.tiktok.com/' },
  facebook: { label: 'Facebook', url: 'https://www.facebook.com/' },
  x: { label: 'X / Twitter', url: 'https://x.com/' },
  youtube: { label: 'YouTube', url: 'https://www.youtube.com/' },
  other: { label: 'Outra', url: '' }
}

export const GROUP_COLORS = [
  '#043EE6',
  '#527CFF',
  '#22B8CF',
  '#F59F00',
  '#F76707',
  '#E64980',
  '#E03131',
  '#8B5CF6',
  '#2FB344',
  '#ADB5BD',
  '#FFFFFF'
] as const

export interface TagDTO {
  id: string
  name: string
  color: string
}

export interface ProfileDTO {
  id: string
  name: string
  /** Plataformas do perfil, a primeira é a principal. */
  platforms: Platform[]
  username: string | null
  homeUrl: string | null
  groupId: string | null
  notes: string
  tags: TagDTO[]
  createdAt: number
  updatedAt: number
  lastOpenedAt: number | null
}

export interface GroupDTO {
  id: string
  name: string
  color: string
  createdAt: number
  profileCount: number
}

export const EVENT_TYPES = [
  'profile_created',
  'profile_updated',
  'profile_deleted',
  'profile_duplicated',
  'browser_started',
  'browser_closed',
  'browser_failed',
  'group_created',
  'group_deleted'
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface EventDTO {
  id: number
  profileId: string | null
  eventType: EventType
  message: string
  createdAt: number
}

export type BrowserStatus = 'closed' | 'starting' | 'open' | 'closing' | 'error'

export interface BrowserState {
  status: BrowserStatus
  error?: string
}

export type BrowserStates = Record<string, BrowserState>

export const PAGES = ['dashboard', 'profiles', 'groups', 'settings'] as const
export type PageId = (typeof PAGES)[number]

export interface Settings {
  startMaximized: boolean
  confirmBeforeClosing: boolean
  reopenLastPage: boolean
  lastPage: PageId
  maxConcurrentBrowsers: number
  showResourceWarnings: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  startMaximized: false,
  confirmBeforeClosing: true,
  reopenLastPage: true,
  lastPage: 'dashboard',
  maxConcurrentBrowsers: 10,
  showResourceWarnings: true
}

/** A partir desta quantidade de navegadores abertos o painel exibe o aviso de consumo. */
export const RESOURCE_WARNING_THRESHOLD = 6

export interface ChromiumInfo {
  installed: boolean
  version: string | null
  executablePath: string | null
  integrity: 'ok' | 'mismatch' | 'not_checked' | 'missing'
  message: string
}

export interface AppInfo {
  name: string
  version: string
  electronVersion: string
  panelChromiumVersion: string
  dataDir: string
  databaseFile: string
  profilesDir: string
  appPath: string
  packaged: boolean
}
