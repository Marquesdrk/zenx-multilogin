import { CircleAlert, CircleCheck, ClipboardPaste, Eye, EyeOff, Gauge, LoaderCircle, MapPin, Radar } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { parseProxyLine } from '@shared/proxyParse'
import { proxyInputSchema, type ProxyInput } from '@shared/schemas'
import { PROXY_TYPE_LABEL, PROXY_TYPES, type ProxyCheck, type ProxyDTO, type ProxyType } from '@shared/types'
import { call, errorMessage } from '@/lib/api'
import { cn, formatRelative, plural } from '@/lib/utils'
import { useApp } from '@/store'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field, Input, Textarea } from './ui/field'
import { Select } from './ui/menus'

/** Estado editável do formulário de proxy (porta como texto enquanto o usuário digita). */
export interface ProxyDraft {
  name: string
  type: ProxyType
  host: string
  port: string
  username: string
  password: string
  changeIpUrl: string
  /** Edição: a senha salva só é substituída se o usuário digitar outra ou limpar. */
  passwordTouched: boolean
}

export type ProxyErrors = Partial<Record<keyof ProxyInput, string>>

export const emptyProxyDraft: ProxyDraft = {
  name: '',
  type: 'http',
  host: '',
  port: '',
  username: '',
  password: '',
  changeIpUrl: '',
  passwordTouched: false
}

export function draftFromProxy(proxy: ProxyDTO): ProxyDraft {
  return {
    name: proxy.name,
    type: proxy.type,
    host: proxy.host,
    port: String(proxy.port),
    username: proxy.username ?? '',
    password: '',
    changeIpUrl: proxy.changeIpUrl ?? '',
    passwordTouched: false
  }
}

/** Valida o rascunho. `keepPassword`: edição sem alterar a senha salva. */
export function validateDraft(
  draft: ProxyDraft,
  keepPassword: boolean
): { ok: true; data: ProxyInput } | { ok: false; errors: ProxyErrors } {
  const candidate = {
    name: draft.name,
    type: draft.type,
    host: draft.host.trim(),
    port: draft.port.trim() === '' ? Number.NaN : Number(draft.port),
    username: draft.username,
    password: keepPassword && !draft.passwordTouched ? undefined : draft.password,
    changeIpUrl: draft.changeIpUrl
  }
  const parsed = proxyInputSchema.safeParse(candidate)
  if (parsed.success) return { ok: true, data: parsed.data }
  const errors: ProxyErrors = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof ProxyInput
    errors[key] ??= key === 'port' ? 'Porta entre 1 e 65535' : issue.message
  }
  return { ok: false, errors }
}

const typeOptions = PROXY_TYPES.map((t) => ({ value: t, label: PROXY_TYPE_LABEL[t] }))

/** Localização compacta: "US · Texas · Houston". */
export function locationLabel(check: ProxyCheck | null): string {
  if (!check?.ok) return ''
  return [check.country, check.region, check.city].filter(Boolean).join(' · ')
}

export function CountryBadge({ code }: { code: string | null }) {
  if (!code) return null
  return (
    <span className="inline-grid h-[18px] min-w-[26px] shrink-0 place-items-center rounded-[5px] border border-white/12 bg-white/[0.07] px-1 text-[10.5px] font-semibold tracking-wide text-white/90">
      {code.toUpperCase().slice(0, 3)}
    </span>
  )
}

/** Resultado da verificação, no estilo "Conexão OK! IP / País / Região / Cidade". */
export function CheckResult({ check, busy }: { check: ProxyCheck | null; busy?: boolean }) {
  if (busy) {
    return (
      <div className="flex items-center gap-2 rounded-control border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[12.5px] text-muted">
        <LoaderCircle className="size-4 animate-spin text-brand-soft" />
        Testando conexão pelo proxy…
      </div>
    )
  }
  if (!check) return null
  if (!check.ok) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-control border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-[12.5px] text-danger">
        <CircleAlert className="mt-px size-4 shrink-0" />
        <span>{check.error ?? 'Falha na conexão.'}</span>
      </div>
    )
  }
  return (
    <div role="status" className="rounded-control border border-success/25 bg-success/[0.07] px-3 py-2.5 text-[12.5px]">
      <p className="flex items-center gap-2 font-medium text-success">
        <CircleCheck className="size-4" />
        Conexão OK
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-white/85">
        <dt className="text-muted">IP</dt>
        <dd className="font-mono text-[12px]" data-testid="proxy-check-ip">{check.ip}</dd>
        <dt className="text-muted">País</dt>
        <dd className="flex items-center gap-1.5">
          <CountryBadge code={check.country} />
        </dd>
        {check.region && (
          <>
            <dt className="text-muted">Região</dt>
            <dd>{check.region}</dd>
          </>
        )}
        {check.city && (
          <>
            <dt className="text-muted">Cidade</dt>
            <dd>{check.city}</dd>
          </>
        )}
        {check.timezone && (
          <>
            <dt className="text-muted">Fuso</dt>
            <dd>{check.timezone}</dd>
          </>
        )}
        {check.latitude !== null && check.longitude !== null && (
          <>
            <dt className="text-muted">Coordenadas</dt>
            <dd className="font-mono text-[12px]">
              {check.latitude.toFixed(4)}, {check.longitude.toFixed(4)}
            </dd>
          </>
        )}
        {check.latencyMs !== null && (
          <>
            <dt className="text-muted">Latência</dt>
            <dd className="tabular-nums">{check.latencyMs} ms</dd>
          </>
        )}
      </dl>
    </div>
  )
}

/**
 * Campos de proxy: colar linha completa, tipo, host, porta, usuário, senha e URL de troca de IP.
 * `idPrefix` evita ids duplicados quando há mais de um formulário na tela.
 */
export function ProxyFields({
  draft,
  onChange,
  errors,
  idPrefix,
  hasSavedPassword,
  showName = true
}: {
  draft: ProxyDraft
  onChange(next: ProxyDraft): void
  errors: ProxyErrors
  idPrefix: string
  hasSavedPassword?: boolean
  showName?: boolean
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [pasteError, setPasteError] = useState<string>()
  const set = <K extends keyof ProxyDraft>(key: K, value: ProxyDraft[K]): void => onChange({ ...draft, [key]: value })

  const applyPaste = (text: string): boolean => {
    const parsed = parseProxyLine(text, draft.type)
    if (!parsed) {
      setPasteError('Formato não reconhecido. Use host:porta:usuário:senha ou usuário:senha@host:porta.')
      return false
    }
    setPasteError(undefined)
    onChange({
      ...draft,
      type: parsed.type,
      host: parsed.host,
      port: String(parsed.port),
      username: parsed.username,
      password: parsed.password,
      passwordTouched: true
    })
    return true
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Colar proxy"
        htmlFor={`${idPrefix}-paste`}
        optional
        error={pasteError}
        hint="host:porta:usuário:senha, usuário:senha@host:porta ou socks5://…"
      >
        <div className="relative">
          <ClipboardPaste className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            id={`${idPrefix}-paste`}
            className="pl-9"
            placeholder="Cole aqui para preencher os campos"
            spellCheck={false}
            autoComplete="off"
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (applyPaste(text)) {
                e.preventDefault()
                e.currentTarget.value = ''
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (applyPaste(e.currentTarget.value)) e.currentTarget.value = ''
              }
            }}
          />
        </div>
      </Field>

      {showName && (
        <Field label="Nome" htmlFor={`${idPrefix}-name`} optional error={errors.name} hint="Se vazio, usa host:porta.">
          <Input id={`${idPrefix}-name`} value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Residencial EUA 01" />
        </Field>
      )}

      <div className="grid grid-cols-[120px_1fr_96px] gap-2.5">
        <Field label="Tipo" htmlFor={`${idPrefix}-type`} error={errors.type}>
          <Select id={`${idPrefix}-type`} value={draft.type} onChange={(v) => set('type', v as ProxyType)} options={typeOptions} />
        </Field>
        <Field label="Host" htmlFor={`${idPrefix}-host`} error={errors.host}>
          <Input
            id={`${idPrefix}-host`}
            value={draft.host}
            aria-invalid={Boolean(errors.host)}
            onChange={(e) => set('host', e.target.value)}
            placeholder="191.96.0.10"
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
        <Field label="Porta" htmlFor={`${idPrefix}-port`} error={errors.port}>
          <Input
            id={`${idPrefix}-port`}
            value={draft.port}
            inputMode="numeric"
            aria-invalid={Boolean(errors.port)}
            onChange={(e) => set('port', e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="8080"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Usuário" htmlFor={`${idPrefix}-user`} optional error={errors.username}>
          <Input id={`${idPrefix}-user`} value={draft.username} onChange={(e) => set('username', e.target.value)} spellCheck={false} autoComplete="off" />
        </Field>
        <Field label="Senha" htmlFor={`${idPrefix}-pass`} optional error={errors.password}>
          <div className="relative">
            <Input
              id={`${idPrefix}-pass`}
              type={showPassword ? 'text' : 'password'}
              className="pr-9"
              value={draft.password}
              onChange={(e) => onChange({ ...draft, password: e.target.value, passwordTouched: true })}
              placeholder={hasSavedPassword && !draft.passwordTouched ? '•••••••• (salva)' : ''}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-white/[0.08] hover:text-white"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
      </div>

      <Field
        label="URL de troca de IP"
        htmlFor={`${idPrefix}-change`}
        optional
        error={errors.changeIpUrl}
        hint="Link do provedor para rotacionar o IP (proxies móveis e rotativos)."
      >
        <Input
          id={`${idPrefix}-change`}
          value={draft.changeIpUrl}
          aria-invalid={Boolean(errors.changeIpUrl)}
          onChange={(e) => set('changeIpUrl', e.target.value)}
          placeholder="https://"
          spellCheck={false}
          autoComplete="off"
        />
      </Field>
    </div>
  )
}

/** Botão "Verificar proxy" + resultado, para dados ainda não salvos. */
export function ProxyTester({
  draft,
  editingId,
  onErrors
}: {
  draft: ProxyDraft
  editingId: string | null
  onErrors(errors: ProxyErrors): void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProxyCheck | null>(null)
  // Alterar os campos invalida o último resultado.
  const key = `${draft.type}|${draft.host}|${draft.port}|${draft.username}|${draft.password}`
  useEffect(() => setResult(null), [key])

  const run = async (): Promise<void> => {
    const validated = validateDraft(draft, editingId !== null)
    if (!validated.ok) {
      onErrors(validated.errors)
      return
    }
    setBusy(true)
    try {
      setResult(await call('proxies:test', { data: validated.data, id: editingId }))
    } catch (error) {
      setResult({
        ok: false,
        checkedAt: Date.now(),
        ip: null,
        country: null,
        region: null,
        city: null,
        timezone: null,
        latitude: null,
        longitude: null,
        latencyMs: null,
        error: errorMessage(error)
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Button className="self-start" onClick={() => void run()} loading={busy}>
        <Radar />
        Verificar proxy
      </Button>
      <CheckResult check={result} busy={busy} />
    </div>
  )
}

/** Modal de criação/edição de proxy da biblioteca. */
export function ProxyFormDialog() {
  const { open, editing } = useApp((s) => s.proxyForm)
  const close = useApp((s) => s.closeProxyForm)
  const toast = useApp((s) => s.toast)
  const [draft, setDraft] = useState<ProxyDraft>(emptyProxyDraft)
  const [errors, setErrors] = useState<ProxyErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(editing ? draftFromProxy(editing) : emptyProxyDraft)
    setErrors({})
    setSaving(false)
  }, [open, editing])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    const validated = validateDraft(draft, editing !== null)
    if (!validated.ok) {
      setErrors(validated.errors)
      return
    }
    setSaving(true)
    try {
      if (editing) await call('proxies:update', { id: editing.id, data: validated.data })
      else await call('proxies:create', validated.data)
      const store = useApp.getState()
      await Promise.all([store.refreshProxies(), store.refreshEvents()])
      toast('success', editing ? 'Proxy atualizado.' : 'Proxy adicionado.')
      close()
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !saving && close()}
      title={editing ? 'Editar proxy' : 'Novo proxy'}
      description="Residencial, datacenter, móvel ou ISP. A senha é guardada cifrada pelo Windows."
      className="w-[540px]"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="proxy-form" loading={saving}>
            {editing ? 'Salvar' : 'Adicionar proxy'}
          </Button>
        </>
      }
    >
      <form id="proxy-form" onSubmit={(e) => void submit(e)} noValidate className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto pr-1">
        <ProxyFields
          idPrefix="proxy"
          draft={draft}
          errors={errors}
          hasSavedPassword={editing?.hasPassword}
          onChange={(next) => {
            setDraft(next)
            setErrors({})
          }}
        />
        <ProxyTester draft={draft} editingId={editing?.id ?? null} onErrors={setErrors} />
      </form>
    </Dialog>
  )
}

/** Importação em massa: um proxy por linha. */
export function ProxyImportDialog() {
  const open = useApp((s) => s.proxyImportOpen)
  const setOpen = useApp((s) => s.setProxyImportOpen)
  const toast = useApp((s) => s.toast)
  const [text, setText] = useState('')
  const [type, setType] = useState<ProxyType>('http')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setBusy(false)
    }
  }, [open])

  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const valid = lines.filter((l) => parseProxyLine(l, type)).length

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await call('proxies:import', { text, type })
      const store = useApp.getState()
      await Promise.all([store.refreshProxies(), store.refreshEvents()])
      toast(
        result.created > 0 ? 'success' : 'warning',
        `${plural(result.created, 'proxy importado', 'proxies importados')}${result.skipped ? `, ${plural(result.skipped, 'linha ignorada', 'linhas ignoradas')}` : ''}.`
      )
      if (result.created > 0) setOpen(false)
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !busy && setOpen(false)}
      title="Importar proxies"
      description="Cole um proxy por linha. Linhas com tipo (socks5://…) usam o tipo indicado."
      className="w-[540px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={valid === 0}>
            Importar {valid > 0 ? `(${valid})` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Tipo padrão" htmlFor="import-type">
          <Select id="import-type" value={type} onChange={(v) => setType(v as ProxyType)} options={typeOptions} />
        </Field>
        <Field
          label="Lista"
          htmlFor="import-text"
          hint={
            lines.length > 0
              ? `${plural(valid, 'linha válida', 'linhas válidas')} de ${lines.length}.`
              : 'Formatos: host:porta, host:porta:usuário:senha, usuário:senha@host:porta.'
          }
        >
          <Textarea
            id="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-44 font-mono text-[12px]"
            placeholder={'191.96.0.10:8080:usuario:senha\nsocks5://usuario:senha@br.proxy.com:1080'}
            spellCheck={false}
          />
        </Field>
      </div>
    </Dialog>
  )
}

/** Resumo do proxy de um perfil para tabelas: país + endereço. */
export function ProxyCell({ proxy }: { proxy: ProxyDTO | undefined }) {
  if (!proxy) return <span className="text-muted/60">—</span>
  const check = proxy.lastCheck
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`${PROXY_TYPE_LABEL[proxy.type]} ${proxy.host}:${proxy.port}${check?.ok ? ` · ${locationLabel(check)}` : ''}`}>
      {check?.ok ? (
        <CountryBadge code={check.country} />
      ) : (
        <span className={cn('size-1.5 shrink-0 rounded-full', check ? 'bg-danger' : 'bg-white/30')} />
      )}
      <span className="truncate text-muted">{proxy.name}</span>
    </span>
  )
}

export function ProxyMeta({ proxy }: { proxy: ProxyDTO }) {
  const check = proxy.lastCheck
  if (!check) return <span className="text-muted/70">Não verificado</span>
  if (!check.ok) {
    return (
      <span className="flex items-center gap-1.5 text-danger" title={check.error ?? undefined}>
        <CircleAlert className="size-3.5 shrink-0" />
        <span className="truncate">{check.error ?? 'Falha'}</span>
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CountryBadge code={check.country} />
      <span className="truncate">{[check.city, check.region].filter(Boolean).join(', ') || '—'}</span>
      <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted">
        <MapPin className="size-3" />
        <span className="font-mono">{check.ip}</span>
      </span>
    </span>
  )
}

export function LatencyBadge({ check }: { check: ProxyCheck | null }) {
  if (!check?.ok || check.latencyMs === null) return <span className="text-muted/60">—</span>
  const ms = check.latencyMs
  return (
    <span
      className={cn('flex items-center gap-1 tabular-nums', ms < 800 ? 'text-success' : ms < 2000 ? 'text-warning' : 'text-danger')}
      title={`Verificado ${formatRelative(check.checkedAt).toLowerCase()}`}
    >
      <Gauge className="size-3.5" />
      {ms} ms
    </span>
  )
}
