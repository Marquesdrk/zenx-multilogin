import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { groupInputSchema, profileInputSchema, type ProfileInput } from '@shared/schemas'
import { GROUP_COLORS, PLATFORM_META, PLATFORMS, PROXY_TYPE_LABEL, type Platform, type ProfileDTO } from '@shared/types'
import { call, errorMessage } from '@/lib/api'
import { cn, plural } from '@/lib/utils'
import { useApp } from '@/store'
import { PlatformIcon } from './common'
import { DEFAULT_REGION } from '@shared/region'
import { parseRegionDraft, RegionSection, regionDraftFrom, type RegionDraft } from './region'
import { CountryBadge, emptyProxyDraft, locationLabel, ProxyFields, ProxyTester, validateDraft, type ProxyDraft, type ProxyErrors } from './proxy'
import { Button } from './ui/button'
import { Dialog, Sheet } from './ui/dialog'
import { controlClass, Field, Input, Textarea } from './ui/field'
import { Select } from './ui/menus'

type Errors = Partial<Record<keyof ProfileInput, string>>
type ProxyMode = 'none' | 'saved' | 'new'

const PROXY_MODES: { value: ProxyMode; label: string }[] = [
  { value: 'none', label: 'Sem proxy' },
  { value: 'saved', label: 'Proxy salvo' },
  { value: 'new', label: 'Novo proxy' }
]

const emptyProfile: ProfileInput = {
  name: '',
  platforms: ['instagram'],
  username: '',
  homeUrl: PLATFORM_META.instagram.url,
  groupId: null,
  proxyId: null,
  region: DEFAULT_REGION,
  tags: [],
  notes: ''
}

function toInput(profile: ProfileDTO): ProfileInput {
  return {
    name: profile.name,
    platforms: [...profile.platforms],
    username: profile.username ?? '',
    homeUrl: profile.homeUrl ?? '',
    groupId: profile.groupId,
    proxyId: profile.proxyId,
    region: profile.region,
    tags: profile.tags.map((t) => t.name),
    notes: profile.notes
  }
}

function TagInput({ value, onChange, error }: { value: string[]; onChange(tags: string[]): void; error?: string }) {
  const [draft, setDraft] = useState('')
  const commit = (): void => {
    const name = draft.trim().replace(/,+$/, '').slice(0, 32)
    if (name && !value.some((t) => t.toLowerCase() === name.toLowerCase())) onChange([...value, name])
    setDraft('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }
  return (
    <div
      aria-invalid={Boolean(error)}
      className={cn(controlClass, 'flex min-h-9 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-brand-soft focus-within:ring-[3px] focus-within:ring-brand/25')}
    >
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.07] py-0.5 pl-2 pr-1 text-[12px]">
          {tag}
          <button
            type="button"
            aria-label={`Remover tag ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="grid size-4 place-items-center rounded text-muted hover:bg-white/10 hover:text-white"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id="profile-tags"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? 'Digite e pressione Enter' : ''}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-[13px] placeholder:text-muted/60 focus:outline-none"
      />
    </div>
  )
}

/** Drawer de criação e edição de perfil. */
export function ProfileFormSheet() {
  const { open, editing } = useApp((s) => s.profileForm)
  const close = useApp((s) => s.closeProfileForm)
  const groups = useApp((s) => s.groups)
  const proxies = useApp((s) => s.proxies)
  const toast = useApp((s) => s.toast)
  const [values, setValues] = useState<ProfileInput>(emptyProfile)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [proxyMode, setProxyMode] = useState<ProxyMode>('none')
  const [proxyDraft, setProxyDraft] = useState<ProxyDraft>(emptyProxyDraft)
  const [proxyErrors, setProxyErrors] = useState<ProxyErrors>({})
  const [regionDraft, setRegionDraft] = useState<RegionDraft>(regionDraftFrom(DEFAULT_REGION))

  useEffect(() => {
    if (!open) return
    setValues(editing ? toInput(editing) : emptyProfile)
    setErrors({})
    setSaving(false)
    setProxyMode(editing?.proxyId ? 'saved' : 'none')
    setProxyDraft(emptyProxyDraft)
    setProxyErrors({})
    setRegionDraft(regionDraftFrom(editing?.region ?? DEFAULT_REGION))
  }, [open, editing])

  const changeProxyMode = (mode: ProxyMode): void => {
    setProxyMode(mode)
    setErrors((e) => ({ ...e, proxyId: undefined, region: undefined }))
    // Com proxy, a região passa a seguir o IP dele; sem proxy, volta à do computador.
    setRegionDraft((r) =>
      mode !== 'none' && r.mode === 'real' && proxyMode === 'none'
        ? { ...r, mode: 'proxy' }
        : mode === 'none' && r.mode === 'proxy'
          ? { ...r, mode: 'real' }
          : r
    )
  }
  const selectedProxyCheck =
    proxyMode === 'saved' && values.proxyId ? (proxies.find((p) => p.id === values.proxyId)?.lastCheck ?? null) : null

  const proxyOptions = useMemo(
    () =>
      proxies.map((p) => ({
        value: p.id,
        label: `${p.name} · ${PROXY_TYPE_LABEL[p.type]}${p.lastCheck?.ok ? ` · ${locationLabel(p.lastCheck)}` : ''}`,
        icon: p.lastCheck?.ok ? (
          <CountryBadge code={p.lastCheck.country} />
        ) : (
          <span className={cn('size-1.5 rounded-full', p.lastCheck ? 'bg-danger' : 'bg-white/30')} />
        )
      })),
    [proxies]
  )

  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]): void => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const togglePlatform = (platform: Platform): void => {
    setValues((v) => {
      const platforms = v.platforms.includes(platform)
        ? v.platforms.filter((p) => p !== platform)
        : [...v.platforms, platform]
      // A URL inicial acompanha a plataforma principal (a primeira selecionada),
      // a menos que o usuário já tenha personalizado o campo.
      const previous = v.platforms[0]
      const next = platforms[0]
      const untouched = v.homeUrl === '' || (previous !== undefined && v.homeUrl === PLATFORM_META[previous].url)
      const homeUrl = untouched ? (next ? PLATFORM_META[next].url : '') : v.homeUrl
      return { ...v, platforms, homeUrl }
    })
    setErrors((e) => ({ ...e, platforms: undefined, homeUrl: undefined }))
  }
  const groupOptions = useMemo(
    () => [
      { value: 'none', label: 'Sem grupo' },
      ...groups.map((g) => ({
        value: g.id,
        label: g.name,
        icon: <span className="size-2 rounded-full" style={{ background: g.color }} />
      }))
    ],
    [groups]
  )

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    const region = parseRegionDraft(regionDraft)
    // "Novo proxy" ainda não tem id: um id provisório só para validar a regra de região.
    const PENDING = '00000000-0000-4000-8000-000000000000'
    const parsed = profileInputSchema.safeParse({
      ...values,
      proxyId: proxyMode === 'saved' ? values.proxyId : proxyMode === 'new' ? PENDING : null,
      region: region.ok ? region.value : DEFAULT_REGION
    })
    const next: Errors = {}
    if (!region.ok) next.region = region.error
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ProfileInput
        next[key] ??= issue.message
      }
    }
    if (proxyMode === 'saved' && !values.proxyId) next.proxyId = 'Selecione um proxy salvo'
    const proxy = proxyMode === 'new' ? validateDraft(proxyDraft, false) : null
    if (proxy && !proxy.ok) setProxyErrors(proxy.errors)
    if (!parsed.success || next.proxyId || next.region || (proxy && !proxy.ok)) {
      setErrors(next)
      return
    }
    setSaving(true)
    try {
      const store = useApp.getState()
      const data = { ...parsed.data }
      if (proxy?.ok) {
        // "Novo proxy" também entra na biblioteca, para ser reutilizado em outros perfis.
        const created = await call('proxies:create', proxy.data)
        data.proxyId = created.id
        setProxyMode('saved')
        setValues((v) => ({ ...v, proxyId: created.id }))
        void store.refreshProxies()
      }
      if (editing) {
        await call('profiles:update', { id: editing.id, data })
        toast('success', 'Perfil atualizado.')
      } else {
        const created = await call('profiles:create', data)
        store.setJustCreated(created)
      }
      await Promise.all([store.refreshProfiles(), store.refreshGroups(), store.refreshProxies(), store.refreshEvents()])
      close()
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && !saving && close()}
      title={editing ? 'Editar perfil' : 'Novo perfil'}
      description={
        editing
          ? 'Altere o cadastro. A sessão e os dados do navegador deste perfil são preservados.'
          : 'Cada perfil abre um Chromium próprio, com cookies e armazenamento independentes.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="profile-form" loading={saving}>
            {editing ? 'Salvar alterações' : 'Criar perfil'}
          </Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <Field label="Nome do perfil" htmlFor="profile-name" error={errors.name}>
          <Input
            id="profile-name"
            autoFocus
            value={values.name}
            maxLength={80}
            aria-invalid={Boolean(errors.name)}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ex.: Instagram 01"
          />
        </Field>
        <Field
          label="Plataformas"
          error={errors.platforms}
          hint="Selecione uma ou mais. A primeira define a URL inicial."
        >
          <div role="group" aria-label="Plataformas" className="grid grid-cols-3 gap-2">
            {PLATFORMS.map((platform) => {
              const index = values.platforms.indexOf(platform)
              const active = index >= 0
              return (
                <button
                  key={platform}
                  type="button"
                  aria-pressed={active}
                  onClick={() => togglePlatform(platform)}
                  className={cn(
                    'no-drag relative flex h-10 items-center gap-1.5 rounded-control border px-2.5 text-[12.5px] font-medium transition-[background-color,border-color,color] duration-150',
                    active
                      ? 'border-brand-soft/60 bg-brand/20 text-white'
                      : 'border-white/10 bg-white/[0.03] text-muted hover:border-white/20 hover:text-white'
                  )}
                >
                  <PlatformIcon platform={platform} />
                  <span className="truncate">{PLATFORM_META[platform].label}</span>
                  {active && (
                    <span className="ml-auto grid size-4 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Usuário" htmlFor="profile-username" optional error={errors.username} hint="Apenas um identificador para você. Senhas nunca são armazenadas.">
          <Input
            id="profile-username"
            value={values.username}
            maxLength={120}
            onChange={(e) => set('username', e.target.value)}
            placeholder="@usuario"
          />
        </Field>
        <Field label="URL inicial" htmlFor="profile-url" optional error={errors.homeUrl} hint="Somente endereços HTTPS.">
          <Input
            id="profile-url"
            value={values.homeUrl}
            aria-invalid={Boolean(errors.homeUrl)}
            onChange={(e) => set('homeUrl', e.target.value)}
            placeholder="https://"
            spellCheck={false}
          />
        </Field>
        <Field label="Proxy" error={errors.proxyId} hint={proxyMode === 'none' ? 'O navegador usa a sua conexão normal.' : undefined}>
          <div role="radiogroup" aria-label="Modo de proxy" className="grid grid-cols-3 gap-1 rounded-control border border-white/10 bg-white/[0.03] p-1">
            {PROXY_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={proxyMode === mode.value}
                onClick={() => changeProxyMode(mode.value)}
                className={cn(
                  'no-drag h-8 rounded-[8px] text-[12.5px] font-medium transition-colors duration-150',
                  proxyMode === mode.value ? 'bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16)]' : 'text-muted hover:bg-white/[0.06] hover:text-white'
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </Field>
        {proxyMode === 'saved' &&
          (proxies.length === 0 ? (
            <p className="-mt-2 text-[12.5px] text-muted">Nenhum proxy salvo ainda. Use “Novo proxy” ou a página Proxies.</p>
          ) : (
            <div className="-mt-2">
              <Select
                id="profile-proxy"
                ariaLabel="Proxy salvo"
                placeholder="Selecione um proxy"
                value={values.proxyId ?? ''}
                onChange={(v) => set('proxyId', v)}
                options={proxyOptions}
              />
            </div>
          ))}
        {proxyMode === 'new' && (
          <div className="-mt-1 flex flex-col gap-4 rounded-[14px] border border-white/8 bg-white/[0.025] p-3.5">
            <ProxyFields
              idPrefix="profile-proxy"
              draft={proxyDraft}
              errors={proxyErrors}
              showName={false}
              onChange={(next) => {
                setProxyDraft(next)
                setProxyErrors({})
              }}
            />
            <ProxyTester draft={proxyDraft} editingId={null} onErrors={setProxyErrors} />
            <p className="text-[12px] text-muted/80">Ao salvar, o proxy também fica disponível na página Proxies.</p>
          </div>
        )}
        <RegionSection
          draft={regionDraft}
          onChange={(next) => {
            setRegionDraft(next)
            setErrors((e) => ({ ...e, region: undefined }))
          }}
          error={errors.region}
          hasProxy={proxyMode !== 'none'}
          proxyCheck={selectedProxyCheck}
        />
        <Field label="Grupo" htmlFor="profile-group" optional error={errors.groupId}>
          <Select
            id="profile-group"
            value={values.groupId ?? 'none'}
            onChange={(v) => set('groupId', v === 'none' ? null : v)}
            options={groupOptions}
          />
        </Field>
        <Field label="Tags" htmlFor="profile-tags" optional error={errors.tags}>
          <TagInput value={values.tags} onChange={(tags) => set('tags', tags)} error={errors.tags} />
        </Field>
        <Field label="Observações" htmlFor="profile-notes" optional error={errors.notes}>
          <Textarea
            id="profile-notes"
            value={values.notes}
            maxLength={2000}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anotações sobre este perfil"
          />
        </Field>
      </form>
    </Sheet>
  )
}

/** Após criar um perfil, oferece abrir o navegador imediatamente. */
export function JustCreatedDialog() {
  const profile = useApp((s) => s.justCreated)
  const dismiss = useApp((s) => s.setJustCreated)
  const openBrowser = useApp((s) => s.openBrowser)
  return (
    <Dialog
      open={profile !== null}
      onOpenChange={(open) => !open && dismiss(null)}
      title="Perfil criado"
      description={profile ? `"${profile.name}" está pronto, com um diretório de navegador exclusivo. Deseja abrir o navegador agora para fazer login?` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => dismiss(null)}>
            Agora não
          </Button>
          <Button
            variant="primary"
            autoFocus
            onClick={() => {
              if (profile) void openBrowser(profile.id)
              dismiss(null)
            }}
          >
            Abrir navegador
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

/** Modal de criação e edição de grupo. */
export function GroupFormDialog() {
  const { open, editing } = useApp((s) => s.groupForm)
  const close = useApp((s) => s.closeGroupForm)
  const toast = useApp((s) => s.toast)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(GROUP_COLORS[0])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setColor(editing?.color ?? GROUP_COLORS[0])
    setError(undefined)
    setSaving(false)
  }, [open, editing])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    const parsed = groupInputSchema.safeParse({ name, color })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }
    setSaving(true)
    try {
      if (editing) await call('groups:update', { id: editing.id, data: parsed.data })
      else await call('groups:create', parsed.data)
      const store = useApp.getState()
      await Promise.all([store.refreshGroups(), store.refreshEvents()])
      toast('success', editing ? 'Grupo atualizado.' : 'Grupo criado.')
      close()
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !saving && close()}
      title={editing ? 'Editar grupo' : 'Novo grupo'}
      description="Grupos organizam seus perfis por tema, cliente ou finalidade."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="group-form" loading={saving}>
            {editing ? 'Salvar' : 'Criar grupo'}
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <Field label="Nome" htmlFor="group-name" error={error}>
          <Input
            id="group-name"
            autoFocus
            value={name}
            maxLength={60}
            aria-invalid={Boolean(error)}
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
            placeholder="Ex.: Clientes"
          />
        </Field>
        <Field label="Cor">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do grupo">
            {GROUP_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={color === option}
                aria-label={`Cor ${option}`}
                onClick={() => setColor(option)}
                className={cn(
                  'grid size-8 place-items-center rounded-[10px] border transition-[border-color,transform] duration-150 hover:scale-105',
                  color === option ? 'border-white/70' : 'border-white/10'
                )}
              >
                <span className="grid size-5 place-items-center rounded-md" style={{ background: option }}>
                  {color === option && <Check className={cn('size-3', option === '#FFFFFF' || option === '#ADB5BD' ? 'text-black' : 'text-white')} strokeWidth={3} />}
                </span>
              </button>
            ))}
          </div>
        </Field>
      </form>
    </Dialog>
  )
}

/** Confirmação genérica para ações destrutivas. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm(): Promise<void> | void
  onCancel(): void
  danger?: boolean
}) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setBusy(false)
  }, [open])
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !busy && onCancel()}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy} autoFocus>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={() => {
              setBusy(true)
              void Promise.resolve(onConfirm()).finally(() => setBusy(false))
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

/** Exibido quando o usuário tenta fechar o painel com navegadores ativos. */
export function ClosePromptDialog() {
  const prompt = useApp((s) => s.closePrompt)
  const dismiss = useApp((s) => s.setClosePrompt)
  return (
    <ConfirmDialog
      open={prompt !== null}
      title="Encerrar navegadores e sair?"
      description={`Há ${plural(prompt?.openCount ?? 0, 'navegador ativo', 'navegadores ativos')}. Ao sair, todos serão encerrados. As sessões ficam salvas e poderão ser reabertas depois.`}
      confirmLabel="Encerrar todos e sair"
      onCancel={() => dismiss(null)}
      onConfirm={async () => {
        await call('app:confirmQuit').catch(() => undefined)
      }}
    />
  )
}
