import { ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight, Copy, Ellipsis, Focus, Pencil, Play, Plus, RotateCw, SearchX, Square, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_FILTERS, filterProfiles, statusOf, type ProfileFilters, type SortKey } from '@shared/filters'
import { PLATFORM_META, PLATFORMS, type BrowserStatus, type ProfileDTO } from '@shared/types'
import { EmptyState, GroupChip, PageHeader, PlatformIcon, PlatformStack, STATUS_LABEL, StatusBadge, TagList } from '@/components/common'
import { ConfirmDialog } from '@/components/forms'
import { ProxyCell } from '@/components/proxy'
import { Button } from '@/components/ui/button'
import { Checkbox, Menu, MenuItem, MenuSeparator, Select } from '@/components/ui/menus'
import { call, errorMessage } from '@/lib/api'
import { cn, formatRelative, plural } from '@/lib/utils'
import { useApp } from '@/store'

const PAGE_SIZE = 50
const GRID =
  'grid grid-cols-[36px_84px_minmax(130px,1.6fr)_minmax(80px,1fr)_minmax(90px,1fr)_minmax(110px,1.2fr)_minmax(90px,1fr)_92px_116px_148px] items-center gap-3 px-4'

/** Botão principal da linha: muda conforme o estado real do navegador. */
export function ProfileAction({ profile, status, subtle }: { profile: ProfileDTO; status: BrowserStatus; subtle?: boolean }) {
  const openBrowser = useApp((s) => s.openBrowser)
  const focusBrowser = useApp((s) => s.focusBrowser)
  if (status === 'open') {
    return (
      <Button size="sm" variant="success" onClick={() => void focusBrowser(profile.id)}>
        <Focus />
        Focar
      </Button>
    )
  }
  if (status === 'starting' || status === 'closing') {
    return (
      <Button size="sm" loading disabled>
        {status === 'starting' ? 'Iniciando' : 'Encerrando'}
      </Button>
    )
  }
  return (
    <Button size="sm" variant={status === 'error' || subtle ? 'secondary' : 'primary'} onClick={() => void openBrowser(profile.id)}>
      {status === 'error' ? <RotateCw /> : <Play />}
      {status === 'error' ? 'Tentar de novo' : 'Abrir'}
    </Button>
  )
}

export function ProfilesPage() {
  const profiles = useApp((s) => s.profiles)
  const groups = useApp((s) => s.groups)
  const states = useApp((s) => s.states)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const openProfileForm = useApp((s) => s.openProfileForm)
  const toast = useApp((s) => s.toast)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [toDelete, setToDelete] = useState<ProfileDTO | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const proxies = useApp((s) => s.proxies)
  const proxyById = useMemo(() => new Map(proxies.map((p) => [p.id, p])), [proxies])
  const visible = useMemo(() => filterProfiles(profiles, filters, states), [profiles, filters, states])
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const rows = useMemo(() => visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE), [visible, current])

  // Mantém a seleção coerente com os perfis existentes.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(profiles.map((p) => p.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [profiles])
  useEffect(() => setPage(0), [filters.search, filters.platform, filters.groupId, filters.status])

  const selectedVisible = visible.filter((p) => selected.has(p.id))
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length
  const toggleAll = (checked: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const p of visible) {
        if (checked) next.add(p.id)
        else next.delete(p.id)
      }
      return next
    })
  }
  const toggleOne = (id: string, checked: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectedIds = [...selected]
  const selectedClosed = selectedIds.filter((id) => ['closed', 'error'].includes(statusOf(states, id)))
  const selectedOpen = selectedIds.filter((id) => ['open', 'starting'].includes(statusOf(states, id)))

  const runBulk = async (action: () => Promise<void>): Promise<void> => {
    setBulkBusy(true)
    try {
      await action()
    } finally {
      setBulkBusy(false)
    }
  }

  const duplicate = async (profile: ProfileDTO): Promise<void> => {
    try {
      await call('profiles:duplicate', { id: profile.id })
      const store = useApp.getState()
      await Promise.all([store.refreshProfiles(), store.refreshGroups(), store.refreshEvents()])
      toast('success', 'Perfil duplicado com um diretório de navegador novo e vazio.')
    } catch (error) {
      toast('error', errorMessage(error))
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!toDelete) return
    try {
      await call('profiles:delete', { id: toDelete.id })
      toast('success', `Perfil "${toDelete.name}" excluído.`)
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      const store = useApp.getState()
      await Promise.all([store.refreshProfiles(), store.refreshGroups(), store.refreshEvents()]).catch(() => undefined)
      setToDelete(null)
    }
  }

  const hasFilters =
    filters.search !== '' || filters.platform !== 'all' || filters.groupId !== 'all' || filters.status !== 'all'
  const clearFilters = (): void =>
    setFilters({ search: '', platform: 'all', groupId: 'all', status: 'all' } satisfies Partial<ProfileFilters>)

  if (profiles.length === 0) {
    return (
      <>
        <PageHeader title="Perfis" subtitle="Gerencie seus navegadores isolados." />
        <div className="glass">
          <EmptyState
            icon={<Users />}
            title="Nenhum perfil cadastrado"
            description="Crie um perfil para abrir um Chromium independente, fazer login manualmente e reutilizar a sessão depois."
            action={
              <Button variant="primary" onClick={() => openProfileForm()}>
                <Plus />
                Criar meu primeiro perfil
              </Button>
            }
          />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Perfis"
        subtitle={
          hasFilters
            ? `${visible.length} de ${plural(profiles.length, 'perfil', 'perfis')}`
            : plural(profiles.length, 'perfil cadastrado', 'perfis cadastrados')
        }
        actions={
          selected.size > 0 ? (
            <>
              <span className="mr-1 text-[12.5px] text-muted">{plural(selected.size, 'selecionado', 'selecionados')}</span>
              <Button
                variant="primary"
                disabled={selectedClosed.length === 0}
                loading={bulkBusy}
                onClick={() => void runBulk(() => useApp.getState().openMany(selectedClosed))}
              >
                <Play />
                Abrir ({selectedClosed.length})
              </Button>
              <Button
                disabled={selectedOpen.length === 0 || bulkBusy}
                onClick={() => void runBulk(() => useApp.getState().closeMany(selectedOpen))}
              >
                <Square />
                Fechar ({selectedOpen.length})
              </Button>
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Select
          ariaLabel="Filtrar por plataforma"
          className="w-44"
          value={filters.platform}
          onChange={(v) => setFilters({ platform: v as ProfileFilters['platform'] })}
          options={[
            { value: 'all', label: 'Todas as plataformas' },
            ...PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].label, icon: <PlatformIcon platform={p} /> }))
          ]}
        />
        <Select
          ariaLabel="Filtrar por grupo"
          className="w-44"
          value={filters.groupId}
          onChange={(v) => setFilters({ groupId: v })}
          options={[
            { value: 'all', label: 'Todos os grupos' },
            { value: 'none', label: 'Sem grupo' },
            ...groups.map((g) => ({
              value: g.id,
              label: g.name,
              icon: <span className="size-2 rounded-full" style={{ background: g.color }} />
            }))
          ]}
        />
        <Select
          ariaLabel="Filtrar por status"
          className="w-40"
          value={filters.status}
          onChange={(v) => setFilters({ status: v as ProfileFilters['status'] })}
          options={[
            { value: 'all', label: 'Todos os status' },
            ...(Object.keys(STATUS_LABEL) as BrowserStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))
          ]}
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Select
            ariaLabel="Ordenar por"
            className="w-44"
            value={filters.sortKey}
            onChange={(v) => setFilters({ sortKey: v as SortKey })}
            options={[
              { value: 'createdAt', label: 'Data de criação' },
              { value: 'name', label: 'Nome' },
              { value: 'lastOpenedAt', label: 'Última utilização' }
            ]}
          />
          <Button
            size="icon"
            className="size-9 rounded-control"
            aria-label={filters.sortDir === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'}
            title={filters.sortDir === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'}
            onClick={() => setFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
          >
            {filters.sortDir === 'asc' ? <ArrowUpAZ /> : <ArrowDownAZ />}
          </Button>
        </div>
      </div>

      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={cn(GRID, 'h-10 shrink-0 border-b border-white/8 text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted/80')}>
          <Checkbox
            ariaLabel="Selecionar todos os perfis visíveis"
            checked={allVisibleSelected ? true : selectedVisible.length > 0 ? 'indeterminate' : false}
            onChange={toggleAll}
          />
          <span />
          <span>Perfil</span>
          <span>Usuário</span>
          <span>Grupo</span>
          <span>Proxy</span>
          <span>Tags</span>
          <span>Status</span>
          <span>Última abertura</span>
          <span className="text-right">Ações</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="Nenhum perfil encontrado"
            description="Nenhum perfil corresponde à busca e aos filtros atuais."
            action={<Button onClick={clearFilters}>Limpar filtros</Button>}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((profile) => {
              const state = states[profile.id]
              const status = state?.status ?? 'closed'
              const isSelected = selected.has(profile.id)
              return (
                <div
                  key={profile.id}
                  data-testid="profile-row"
                  className={cn(
                    GRID,
                    'h-[52px] border-b border-white/[0.05] text-[13px] transition-colors duration-150 last:border-b-0 hover:bg-white/[0.035]',
                    isSelected && 'bg-brand/[0.08] hover:bg-brand/[0.11]'
                  )}
                >
                  <Checkbox
                    ariaLabel={`Selecionar ${profile.name}`}
                    checked={isSelected}
                    onChange={(checked) => toggleOne(profile.id, checked)}
                  />
                  <PlatformStack platforms={profile.platforms} />
                  <span className="truncate font-medium" title={profile.name}>
                    {profile.name}
                  </span>
                  <span className="truncate text-muted" title={profile.username ?? undefined}>
                    {profile.username ?? <span className="text-muted/60">—</span>}
                  </span>
                  <span className="min-w-0">
                    <GroupChip group={profile.groupId ? groupById.get(profile.groupId) : undefined} />
                  </span>
                  <span className="min-w-0 text-[12.5px]">
                    <ProxyCell proxy={profile.proxyId ? proxyById.get(profile.proxyId) : undefined} />
                  </span>
                  <TagList tags={profile.tags} />
                  <StatusBadge status={status} title={state?.error} />
                  <span className="truncate text-muted">{formatRelative(profile.lastOpenedAt)}</span>
                  <div className="flex items-center justify-end gap-1.5">
                    <ProfileAction profile={profile} status={status} />
                    <Menu
                      trigger={
                        <Button size="icon" variant="ghost" aria-label={`Mais ações de ${profile.name}`}>
                          <Ellipsis />
                        </Button>
                      }
                    >
                      {(status === 'open' || status === 'starting') && (
                        <>
                          <MenuItem onSelect={() => void useApp.getState().closeBrowser(profile.id)}>
                            <Square />
                            Fechar navegador
                          </MenuItem>
                          <MenuSeparator />
                        </>
                      )}
                      <MenuItem onSelect={() => openProfileForm(profile)}>
                        <Pencil />
                        Editar
                      </MenuItem>
                      <MenuItem onSelect={() => void duplicate(profile)}>
                        <Copy />
                        Duplicar cadastro
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => setToDelete(profile)}>
                        <Trash2 />
                        Excluir
                      </MenuItem>
                    </Menu>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex h-11 shrink-0 items-center justify-between border-t border-white/8 px-4 text-[12.5px] text-muted">
            <span>
              {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, visible.length)} de {visible.length}
            </span>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="ghost" aria-label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)}>
                <ChevronLeft />
              </Button>
              <span className="tabular-nums">
                {current + 1} / {pageCount}
              </span>
              <Button size="icon" variant="ghost" aria-label="Próxima página" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir perfil?"
        description={`"${toDelete?.name ?? ''}" será removido junto com os dados de navegação dele (cookies, sessão e histórico). Se o navegador estiver aberto, será encerrado. Essa ação não pode ser desfeita e não afeta outros perfis.`}
        confirmLabel="Excluir perfil"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}

export { DEFAULT_FILTERS }
