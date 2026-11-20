import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, filterProfiles } from '../src/shared/filters'
import type { BrowserStates, ProfileDTO } from '../src/shared/types'
import { DEFAULT_REGION } from '../src/shared/region'

const make = (over: Partial<ProfileDTO>): ProfileDTO => ({
  id: 'x',
  name: 'Perfil',
  platforms: ['instagram'],
  username: null,
  homeUrl: null,
  groupId: null,
  proxyId: null,
  region: DEFAULT_REGION,
  notes: '',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  lastOpenedAt: null,
  ...over
})

const profiles = [
  make({ id: 'a', name: 'Instagram 01', username: 'memes_br', groupId: 'g1', createdAt: 1, lastOpenedAt: 50 }),
  make({ id: 'b', name: 'TikTok Séries', platforms: ['tiktok', 'instagram'], username: 'doramas', groupId: 'g2', createdAt: 2 }),
  make({ id: 'c', name: 'instagram 10', username: 'futebol', createdAt: 3, lastOpenedAt: 90 }),
  make({ id: 'd', name: 'Instagram 2', platforms: ['youtube'], createdAt: 4, lastOpenedAt: 10 })
]
const states: BrowserStates = { a: { status: 'open' }, c: { status: 'starting' } }
const ids = (list: ProfileDTO[]) => list.map((p) => p.id).join('')

describe('pesquisa e filtros de perfis', () => {
  it('pesquisa por nome ou usuário, ignorando acentos e maiúsculas', () => {
    expect(
      ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, search: 'INSTAGRAM', sortKey: 'name', sortDir: 'asc' }))
    ).toBe('adc')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, search: 'series' }))).toBe('b')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, search: 'dorama' }))).toBe('b')
    expect(filterProfiles(profiles, { ...DEFAULT_FILTERS, search: 'inexistente' })).toHaveLength(0)
  })

  it('filtra por plataforma, grupo e status', () => {
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, platform: 'tiktok' }))).toBe('b')
    // Perfis com várias plataformas aparecem no filtro de cada uma delas.
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, platform: 'instagram' }))).toBe('cba')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, groupId: 'g1' }))).toBe('a')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, groupId: 'none' }))).toBe('dc')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, status: 'open' }, states))).toBe('a')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, status: 'closed' }, states))).toBe('db')
    expect(
      ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, platform: 'instagram', status: 'starting' }, states))
    ).toBe('c')
  })

  it('ordena por nome, criação e última utilização', () => {
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, sortKey: 'name', sortDir: 'asc' }))).toBe('adcb')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, sortKey: 'createdAt', sortDir: 'asc' }))).toBe('abcd')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, sortKey: 'createdAt', sortDir: 'desc' }))).toBe('dcba')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, sortKey: 'lastOpenedAt', sortDir: 'desc' }))).toBe('cadb')
    expect(ids(filterProfiles(profiles, { ...DEFAULT_FILTERS, sortKey: 'lastOpenedAt', sortDir: 'asc' }))).toBe('dacb')
  })
})
