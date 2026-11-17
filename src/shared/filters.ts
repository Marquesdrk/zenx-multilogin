import type { BrowserStates, BrowserStatus, Platform, ProfileDTO } from './types'

export type SortKey = 'name' | 'createdAt' | 'lastOpenedAt'
export type SortDir = 'asc' | 'desc'

export interface ProfileFilters {
  search: string
  platform: Platform | 'all'
  /** 'none' filtra perfis sem grupo. */
  groupId: string | 'all' | 'none'
  status: BrowserStatus | 'all'
  sortKey: SortKey
  sortDir: SortDir
}

export const DEFAULT_FILTERS: ProfileFilters = {
  search: '',
  platform: 'all',
  groupId: 'all',
  status: 'all',
  sortKey: 'createdAt',
  sortDir: 'desc'
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function statusOf(states: BrowserStates, id: string): BrowserStatus {
  return states[id]?.status ?? 'closed'
}

/** Filtra e ordena perfis. Função pura, usada pela interface e pelos testes. */
export function filterProfiles(
  profiles: readonly ProfileDTO[],
  filters: ProfileFilters,
  states: BrowserStates = {}
): ProfileDTO[] {
  const term = normalize(filters.search)
  const result = profiles.filter((p) => {
    if (term) {
      const haystack = normalize(`${p.name} ${p.username ?? ''}`)
      if (!haystack.includes(term)) return false
    }
    if (filters.platform !== 'all' && !p.platforms.includes(filters.platform)) return false
    if (filters.groupId === 'none' && p.groupId !== null) return false
    if (filters.groupId !== 'all' && filters.groupId !== 'none' && p.groupId !== filters.groupId)
      return false
    if (filters.status !== 'all' && statusOf(states, p.id) !== filters.status) return false
    return true
  })

  const dir = filters.sortDir === 'asc' ? 1 : -1
  result.sort((a, b) => {
    let cmp: number
    if (filters.sortKey === 'name') {
      cmp = a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
    } else if (filters.sortKey === 'createdAt') {
      cmp = a.createdAt - b.createdAt
    } else {
      // Perfis nunca abertos ficam sempre no final.
      if (a.lastOpenedAt === null && b.lastOpenedAt === null) cmp = 0
      else if (a.lastOpenedAt === null) return 1
      else if (b.lastOpenedAt === null) return -1
      else cmp = a.lastOpenedAt - b.lastOpenedAt
    }
    return cmp !== 0 ? cmp * dir : a.name.localeCompare(b.name, 'pt-BR')
  })
  return result
}
