import { Activity, CircleAlert, CirclePlay, CircleStop, FolderKanban, FolderPlus, History, MonitorPlay, MonitorX, Network, Plus, Rows3, UserPlus, Users } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { statusOf } from '@shared/filters'
import type { EventType } from '@shared/types'
import { EmptyState, GroupChip, PageHeader, platformLabels, PlatformStack, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { cn, formatRelative } from '@/lib/utils'
import { selectOpenCount, useApp } from '@/store'
import { ProfileAction } from './ProfilesPage'

function Stat({ label, value, icon, accent }: { label: string; value: number; icon: ReactNode; accent?: 'brand' | 'success' }) {
  return (
    <div className="glass flex items-center gap-4 p-5">
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-[13px] border [&_svg]:size-5',
          accent === 'success'
            ? 'border-success/20 bg-success/10 text-success'
            : accent === 'brand'
              ? 'border-brand-soft/25 bg-brand/20 text-brand-soft'
              : 'border-white/8 bg-white/[0.05] text-muted'
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
        <p className="mt-1.5 truncate text-[12.5px] text-muted">{label}</p>
      </div>
    </div>
  )
}

function QuickAction({ icon, title, hint, onClick, disabled }: { icon: ReactNode; title: string; hint: string; onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] p-3 text-left transition-[background-color,border-color] duration-150 hover:border-brand-soft/40 hover:bg-brand/[0.1] disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/[0.06] text-white/80 transition-colors duration-150 group-hover:bg-brand group-hover:text-white [&_svg]:size-[17px]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="block truncate text-[12px] text-muted">{hint}</span>
      </span>
    </button>
  )
}

const eventIcon: Record<EventType, { icon: ReactNode; className: string }> = {
  profile_created: { icon: <UserPlus />, className: 'text-brand-soft' },
  profile_updated: { icon: <Users />, className: 'text-muted' },
  profile_duplicated: { icon: <UserPlus />, className: 'text-brand-soft' },
  profile_deleted: { icon: <MonitorX />, className: 'text-muted' },
  browser_started: { icon: <CirclePlay />, className: 'text-success' },
  browser_closed: { icon: <CircleStop />, className: 'text-muted' },
  browser_failed: { icon: <CircleAlert />, className: 'text-danger' },
  group_created: { icon: <FolderPlus />, className: 'text-brand-soft' },
  group_deleted: { icon: <FolderKanban />, className: 'text-muted' },
  proxy_created: { icon: <Network />, className: 'text-brand-soft' },
  proxy_updated: { icon: <Network />, className: 'text-muted' },
  proxy_deleted: { icon: <Network />, className: 'text-muted' }
}

export function DashboardPage() {
  const profiles = useApp((s) => s.profiles)
  const groups = useApp((s) => s.groups)
  const events = useApp((s) => s.events)
  const states = useApp((s) => s.states)
  const openCount = useApp(selectOpenCount)
  const navigate = useApp((s) => s.navigate)
  const openProfileForm = useApp((s) => s.openProfileForm)
  const openGroupForm = useApp((s) => s.openGroupForm)
  const openBrowser = useApp((s) => s.openBrowser)

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const recent = useMemo(
    () =>
      [...profiles]
        .sort((a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt))
        .slice(0, 6),
    [profiles]
  )
  const lastUsed = useMemo(
    () =>
      profiles.reduce<(typeof profiles)[number] | null>(
        (best, p) => (p.lastOpenedAt !== null && (best === null || p.lastOpenedAt > (best.lastOpenedAt ?? 0)) ? p : best),
        null
      ),
    [profiles]
  )

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão geral dos seus perfis e navegadores locais." />

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Perfis cadastrados" value={profiles.length} icon={<Users />} accent="brand" />
        <Stat label="Perfis abertos" value={openCount} icon={<MonitorPlay />} accent={openCount > 0 ? 'success' : undefined} />
        <Stat label="Perfis fechados" value={Math.max(0, profiles.length - openCount)} icon={<MonitorX />} />
        <Stat label="Grupos" value={groups.length} icon={<FolderKanban />} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3">
        <QuickAction icon={<Plus />} title="Criar novo perfil" hint="Chromium isolado" onClick={() => openProfileForm()} />
        <QuickAction
          icon={<History />}
          title="Abrir último perfil"
          hint={lastUsed ? lastUsed.name : 'Nenhum perfil aberto ainda'}
          disabled={!lastUsed}
          onClick={() => lastUsed && void openBrowser(lastUsed.id)}
        />
        <QuickAction icon={<Rows3 />} title="Ver todos os perfis" hint="Tabela completa" onClick={() => navigate('profiles')} />
        <QuickAction icon={<FolderPlus />} title="Criar grupo" hint="Organize por tema" onClick={() => openGroupForm()} />
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] gap-4">
        <section className="glass flex min-h-0 flex-col overflow-hidden">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-5">
            <h2 className="text-[13.5px] font-semibold">Perfis recentes</h2>
            {profiles.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => navigate('profiles')}>
                Ver todos
              </Button>
            )}
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="Comece criando um perfil"
              description="Cada perfil abre um Chromium próprio, com cookies e sessões separados dos demais."
              action={
                <Button variant="primary" onClick={() => openProfileForm()}>
                  <Plus />
                  Criar meu primeiro perfil
                </Button>
              }
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {recent.map((profile) => {
                const status = statusOf(states, profile.id)
                return (
                  <div
                    key={profile.id}
                    className="grid h-[52px] grid-cols-[84px_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_100px_128px] items-center gap-3 border-b border-white/[0.05] px-5 text-[13px] transition-colors duration-150 last:border-b-0 hover:bg-white/[0.035]"
                  >
                    <PlatformStack platforms={profile.platforms} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{profile.name}</span>
                      <span className="block truncate text-[12px] text-muted">{platformLabels(profile.platforms)}</span>
                    </span>
                    <span className="min-w-0">
                      <GroupChip group={profile.groupId ? groupById.get(profile.groupId) : undefined} />
                    </span>
                    <span className="truncate text-muted">{formatRelative(profile.lastOpenedAt)}</span>
                    <StatusBadge status={status} title={states[profile.id]?.error} />
                    <span className="flex justify-end">
                      <ProfileAction profile={profile} status={status} subtle />
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="glass flex min-h-0 flex-col overflow-hidden">
          <div className="flex h-12 shrink-0 items-center border-b border-white/8 px-5">
            <h2 className="text-[13.5px] font-semibold">Atividade recente</h2>
          </div>
          {events.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted">
              <Activity className="size-5" />
              <p className="text-[13px]">Os eventos locais aparecerão aqui.</p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto py-2">
              {events.map((event) => {
                const meta = eventIcon[event.eventType] ?? eventIcon.profile_updated
                return (
                  <li key={event.id} className="flex items-start gap-3 px-5 py-2">
                    <span className={cn('mt-0.5 shrink-0 [&_svg]:size-4', meta.className)}>{meta.icon}</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-white/85">{event.message}</span>
                    <span className="shrink-0 text-[12px] text-muted/80">{formatRelative(event.createdAt)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
