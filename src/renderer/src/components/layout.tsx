import { ChevronRight, Copy, FolderKanban, LayoutDashboard, Minus, MonitorSmartphone, Plus, Search, Settings, Square, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PageId } from '@shared/types'
import logoUrl from '@/assets/logo.png'
import { call, subscribe } from '@/lib/api'
import { cn, plural } from '@/lib/utils'
import { selectOpenCount, useApp } from '@/store'
import { Button } from './ui/button'

export const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  profiles: 'Perfis',
  groups: 'Grupos',
  settings: 'Configurações'
}

const NAV: { id: PageId; icon: ReactNode }[] = [
  { id: 'dashboard', icon: <LayoutDashboard /> },
  { id: 'profiles', icon: <Users /> },
  { id: 'groups', icon: <FolderKanban /> },
  { id: 'settings', icon: <Settings /> }
]

export function Sidebar() {
  const page = useApp((s) => s.page)
  const navigate = useApp((s) => s.navigate)
  const openCount = useApp(selectOpenCount)
  const profileCount = useApp((s) => s.profiles.length)
  const version = useApp((s) => s.appInfo?.version)

  return (
    <aside className="flex w-[230px] shrink-0 flex-col border-r border-white/8 bg-white/[0.025] backdrop-blur-2xl">
      <div className="drag flex items-center gap-3 px-5 pb-5 pt-5">
        <img src={logoUrl} alt="Zenx" draggable={false} className="size-9 rounded-[10px] shadow-[0_6px_20px_-6px_rgb(4_62_230/0.9)]" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[14px] font-semibold tracking-[-0.01em]">Zenx MultiLogin</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="size-1.5 rounded-full bg-brand-soft" />
            Aplicativo local
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3" aria-label="Navegação principal">
        {NAV.map((item) => {
          const active = page === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'no-drag group relative flex h-9 items-center gap-3 rounded-[11px] px-3 text-[13px] font-medium transition-colors duration-150 [&_svg]:size-[17px]',
                active
                  ? 'bg-brand/90 text-white shadow-[0_8px_22px_-12px_rgb(4_62_230/1),inset_0_1px_0_rgb(255_255_255/0.16)]'
                  : 'text-muted hover:bg-white/[0.06] hover:text-white'
              )}
            >
              {item.icon}
              <span className="flex-1 text-left">{PAGE_TITLES[item.id]}</span>
              {item.id === 'profiles' && profileCount > 0 && (
                <span className={cn('text-[11.5px] tabular-nums', active ? 'text-white/80' : 'text-muted/70')}>
                  {profileCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 p-3">
        <div className="rounded-[14px] border border-white/8 bg-white/[0.035] p-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'grid size-8 place-items-center rounded-[10px] [&_svg]:size-4',
                openCount > 0 ? 'bg-success/12 text-success' : 'bg-white/[0.06] text-muted'
              )}
            >
              <MonitorSmartphone />
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold tabular-nums">{openCount}</p>
              <p className="text-[11.5px] text-muted">{openCount === 1 ? 'navegador aberto' : 'navegadores abertos'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11.5px] text-muted/80">v{version ?? '—'}</span>
          <button
            type="button"
            aria-label="Abrir configurações"
            onClick={() => navigate('settings')}
            className="no-drag grid size-7 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
          >
            <Settings className="size-[15px]" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    void call('window:isMaximized').then(setMaximized).catch(() => undefined)
    return subscribe('window:maximized', setMaximized)
  }, [])
  const base =
    'no-drag grid h-8 w-10 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-white/[0.08] hover:text-white'
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label="Minimizar" className={base} onClick={() => void call('window:minimize')}>
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restaurar' : 'Maximizar'}
        className={base}
        onClick={() => void call('window:toggleMaximize').then(setMaximized)}
      >
        {maximized ? <Copy className="size-3.5 -scale-x-100" /> : <Square className="size-3" />}
      </button>
      <button
        type="button"
        aria-label="Fechar"
        className={cn(base, 'hover:bg-danger hover:text-white')}
        onClick={() => void call('window:close')}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

export function TopBar() {
  const page = useApp((s) => s.page)
  const navigate = useApp((s) => s.navigate)
  const search = useApp((s) => s.filters.search)
  const setFilters = useApp((s) => s.setFilters)
  const openProfileForm = useApp((s) => s.openProfileForm)
  const openCount = useApp(selectOpenCount)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl+K foca a busca; Ctrl+N cria um perfil.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.shiftKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (key === 'n') {
        event.preventDefault()
        openProfileForm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openProfileForm])

  return (
    <header className="drag flex h-14 shrink-0 items-center gap-4 border-b border-white/8 pl-7 pr-2">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <span className="text-muted">Zenx</span>
        <ChevronRight className="size-3.5 text-muted/60" />
        <span className="truncate font-medium">{PAGE_TITLES[page]}</span>
      </div>

      <div className="no-drag relative ml-auto w-[300px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          value={search}
          onChange={(event) => {
            setFilters({ search: event.target.value })
            if (page !== 'profiles' && event.target.value) navigate('profiles')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setFilters({ search: '' })
              event.currentTarget.blur()
            }
          }}
          placeholder="Buscar perfis"
          aria-label="Busca global de perfis"
          className="h-9 w-full rounded-control border border-white/8 bg-white/[0.04] pl-9 pr-14 text-[13px] placeholder:text-muted/60 transition-[border-color,background-color,box-shadow] duration-150 hover:border-white/14 focus:border-brand-soft focus:bg-white/[0.06] focus:outline-none focus:ring-[3px] focus:ring-brand/25"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-sans text-[10.5px] text-muted">
          Ctrl K
        </kbd>
      </div>

      <div
        title="Navegadores abertos"
        className={cn(
          'flex h-9 items-center gap-2 rounded-control border px-3 text-[12.5px] font-medium tabular-nums',
          openCount > 0 ? 'border-success/25 bg-success/10 text-success' : 'border-white/8 bg-white/[0.04] text-muted'
        )}
      >
        <span className={cn('size-1.5 rounded-full', openCount > 0 ? 'bg-success' : 'bg-white/30')} />
        {plural(openCount, 'aberto', 'abertos')}
      </div>

      <Button variant="primary" onClick={() => openProfileForm()}>
        <Plus />
        Novo perfil
      </Button>

      <span className="mx-1 h-5 w-px bg-white/10" />
      <WindowControls />
    </header>
  )
}
