import { Ellipsis, FolderKanban, Pencil, Plus, Rows3, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { GroupDTO } from '@shared/types'
import { EmptyState, PageHeader } from '@/components/common'
import { ConfirmDialog } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menus'
import { call, errorMessage } from '@/lib/api'
import { formatRelative, plural } from '@/lib/utils'
import { useApp } from '@/store'

export function GroupsPage() {
  const groups = useApp((s) => s.groups)
  const openGroupForm = useApp((s) => s.openGroupForm)
  const navigate = useApp((s) => s.navigate)
  const setFilters = useApp((s) => s.setFilters)
  const toast = useApp((s) => s.toast)
  const [toDelete, setToDelete] = useState<GroupDTO | null>(null)

  const showProfiles = (group: GroupDTO): void => {
    setFilters({ groupId: group.id, search: '', platform: 'all', status: 'all' })
    navigate('profiles')
  }

  const confirmDelete = async (): Promise<void> => {
    if (!toDelete) return
    try {
      await call('groups:delete', { id: toDelete.id })
      const store = useApp.getState()
      if (store.filters.groupId === toDelete.id) store.setFilters({ groupId: 'all' })
      await Promise.all([store.refreshGroups(), store.refreshProfiles(), store.refreshEvents()])
      toast('success', `Grupo "${toDelete.name}" excluído. Os perfis foram mantidos.`)
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setToDelete(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Grupos"
        subtitle="Organize perfis por tema, cliente ou finalidade."
        actions={
          <Button variant="primary" onClick={() => openGroupForm()}>
            <Plus />
            Novo grupo
          </Button>
        }
      />

      {groups.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon={<FolderKanban />}
            title="Nenhum grupo criado"
            description="Crie grupos para separar seus perfis e filtrá-los rapidamente na tabela."
            action={
              <Button variant="primary" onClick={() => openGroupForm()}>
                <Plus />
                Criar grupo
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 overflow-y-auto pb-1">
          {groups.map((group) => (
            <article key={group.id} className="glass flex flex-col gap-4 p-5 transition-[border-color] duration-200 hover:border-white/16">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[12px] border border-white/10"
                  style={{ background: `${group.color}22` }}
                >
                  <span className="size-3 rounded-full" style={{ background: group.color, boxShadow: `0 0 14px ${group.color}99` }} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14.5px] font-semibold" title={group.name}>
                    {group.name}
                  </h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {plural(group.profileCount, 'perfil', 'perfis')} · criado {formatRelative(group.createdAt).toLowerCase()}
                  </p>
                </div>
                <Menu
                  trigger={
                    <Button size="icon" variant="ghost" aria-label={`Ações do grupo ${group.name}`}>
                      <Ellipsis />
                    </Button>
                  }
                >
                  <MenuItem onSelect={() => openGroupForm(group)}>
                    <Pencil />
                    Editar
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setToDelete(group)}>
                    <Trash2 />
                    Excluir
                  </MenuItem>
                </Menu>
              </div>
              <Button size="sm" className="self-start" disabled={group.profileCount === 0} onClick={() => showProfiles(group)}>
                <Rows3 />
                Ver perfis
              </Button>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir grupo?"
        description={`O grupo "${toDelete?.name ?? ''}" será removido. ${
          toDelete && toDelete.profileCount > 0
            ? `${plural(toDelete.profileCount, 'perfil associado continuará existindo e ficará', 'perfis associados continuarão existindo e ficarão')} sem grupo.`
            : 'Nenhum perfil será excluído.'
        }`}
        confirmLabel="Excluir grupo"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}
