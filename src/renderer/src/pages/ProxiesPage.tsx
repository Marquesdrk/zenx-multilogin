import { Ellipsis, Network, Pencil, Plus, Radar, RefreshCw, Trash2, Upload, Users } from 'lucide-react'
import { useState } from 'react'
import { PROXY_TYPE_LABEL, type ProxyDTO } from '@shared/types'
import { EmptyState, PageHeader } from '@/components/common'
import { ConfirmDialog } from '@/components/forms'
import { LatencyBadge, ProxyMeta } from '@/components/proxy'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menus'
import { call, errorMessage } from '@/lib/api'
import { cn, plural } from '@/lib/utils'
import { useApp } from '@/store'

const GRID =
  'grid grid-cols-[minmax(180px,1.4fr)_84px_minmax(220px,1.8fr)_92px_72px_210px] items-center gap-3 px-4'

export function ProxiesPage() {
  const proxies = useApp((s) => s.proxies)
  const openProxyForm = useApp((s) => s.openProxyForm)
  const setImportOpen = useApp((s) => s.setProxyImportOpen)
  const toast = useApp((s) => s.toast)
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [rotating, setRotating] = useState<Set<string>>(new Set())
  const [checkingAll, setCheckingAll] = useState(false)
  const [toDelete, setToDelete] = useState<ProxyDTO | null>(null)

  const mark = (setter: typeof setChecking, id: string, on: boolean): void =>
    setter((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const check = async (proxy: ProxyDTO, quiet = false): Promise<void> => {
    mark(setChecking, proxy.id, true)
    try {
      const updated = await call('proxies:check', { id: proxy.id })
      useApp.getState().putProxy(updated)
      if (!quiet) {
        if (updated.lastCheck?.ok) toast('success', `"${proxy.name}" funcionando · IP ${updated.lastCheck.ip}`)
        else toast('error', `"${proxy.name}": ${updated.lastCheck?.error ?? 'falha na conexão'}`)
      }
    } catch (error) {
      if (!quiet) toast('error', errorMessage(error))
    } finally {
      mark(setChecking, proxy.id, false)
    }
  }

  const checkAll = async (): Promise<void> => {
    setCheckingAll(true)
    const queue = [...proxies]
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next; next = queue.shift()) await check(next, true)
    }
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
    setCheckingAll(false)
    const latest = useApp.getState().proxies
    const ok = latest.filter((p) => p.lastCheck?.ok).length
    toast(ok === latest.length ? 'success' : 'warning', `${ok} de ${plural(latest.length, 'proxy funcionando', 'proxies funcionando')}.`)
  }

  const changeIp = async (proxy: ProxyDTO): Promise<void> => {
    mark(setRotating, proxy.id, true)
    try {
      const result = await call('proxies:changeIp', { id: proxy.id })
      toast(result.ok ? 'success' : 'error', result.message)
      await useApp.getState().refreshProxies()
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      mark(setRotating, proxy.id, false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!toDelete) return
    try {
      await call('proxies:delete', { id: toDelete.id })
      const store = useApp.getState()
      await Promise.all([store.refreshProxies(), store.refreshProfiles(), store.refreshEvents()])
      toast('success', `Proxy "${toDelete.name}" removido.`)
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setToDelete(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Proxies"
        subtitle={
          proxies.length > 0
            ? plural(proxies.length, 'proxy salvo', 'proxies salvos')
            : 'Residencial, datacenter, móvel ou ISP, por perfil.'
        }
        actions={
          <>
            {proxies.length > 0 && (
              <Button onClick={() => void checkAll()} loading={checkingAll}>
                <Radar />
                Verificar todos
              </Button>
            )}
            <Button onClick={() => setImportOpen(true)}>
              <Upload />
              Importar
            </Button>
            <Button variant="primary" onClick={() => openProxyForm()}>
              <Plus />
              Novo proxy
            </Button>
          </>
        }
      />

      {proxies.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<Network />}
            title="Nenhum proxy salvo"
            description="Adicione proxies HTTP, HTTPS ou SOCKS5 (com ou sem usuário e senha) e vincule cada um a um perfil. O navegador do perfil sai pela internet com o IP do proxy."
            action={
              <div className="flex gap-2">
                <Button onClick={() => setImportOpen(true)}>
                  <Upload />
                  Importar lista
                </Button>
                <Button variant="primary" onClick={() => openProxyForm()}>
                  <Plus />
                  Adicionar proxy
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={cn(GRID, 'h-10 shrink-0 border-b border-white/8 text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted/80')}>
            <span>Proxy</span>
            <span>Tipo</span>
            <span>Localização / IP de saída</span>
            <span>Latência</span>
            <span>Perfis</span>
            <span className="text-right">Ações</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {proxies.map((proxy) => {
              const busy = checking.has(proxy.id)
              return (
                <div
                  key={proxy.id}
                  data-testid="proxy-row"
                  className={cn(GRID, 'h-[56px] border-b border-white/[0.05] text-[13px] transition-colors duration-150 last:border-b-0 hover:bg-white/[0.035]')}
                >
                  <div className="min-w-0 leading-tight">
                    <p className="truncate font-medium" title={proxy.name}>
                      {proxy.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11.5px] text-muted">
                      {proxy.host}:{proxy.port}
                      {proxy.username ? ` · ${proxy.username}` : ''}
                    </p>
                  </div>
                  <span>
                    <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[11.5px] font-medium">
                      {PROXY_TYPE_LABEL[proxy.type]}
                    </span>
                  </span>
                  <span className="min-w-0 text-[12.5px]">
                    <ProxyMeta proxy={proxy} />
                  </span>
                  <span className="text-[12.5px]">
                    <LatencyBadge check={proxy.lastCheck} />
                  </span>
                  <span className="flex items-center gap-1.5 text-muted">
                    <Users className="size-3.5" />
                    {proxy.profileCount}
                  </span>
                  <div className="flex items-center justify-end gap-1.5">
                    {proxy.changeIpUrl && (
                      <Button size="sm" variant="ghost" loading={rotating.has(proxy.id)} onClick={() => void changeIp(proxy)} title="Chamar a URL de troca de IP">
                        <RefreshCw />
                        Trocar IP
                      </Button>
                    )}
                    <Button size="sm" loading={busy} onClick={() => void check(proxy)}>
                      {!busy && <Radar />}
                      Verificar
                    </Button>
                    <Menu
                      trigger={
                        <Button size="icon" variant="ghost" aria-label={`Ações do proxy ${proxy.name}`}>
                          <Ellipsis />
                        </Button>
                      }
                    >
                      <MenuItem onSelect={() => openProxyForm(proxy)}>
                        <Pencil />
                        Editar
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => setToDelete(proxy)}>
                        <Trash2 />
                        Excluir
                      </MenuItem>
                    </Menu>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir proxy?"
        description={`"${toDelete?.name ?? ''}" será removido. ${
          toDelete && toDelete.profileCount > 0
            ? `${plural(toDelete.profileCount, 'perfil que o usa passará', 'perfis que o usam passarão')} a abrir sem proxy.`
            : 'Nenhum perfil usa este proxy.'
        }`}
        confirmLabel="Excluir proxy"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}
