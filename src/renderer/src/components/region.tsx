import { Clock, Crosshair, Globe, Languages, MapPin } from 'lucide-react'
import { useMemo } from 'react'
import { DEFAULT_GEO_ACCURACY, LOCALES, localeForCountry, REGION_MODE_LABEL, REGION_MODES, type RegionMode } from '@shared/region'
import type { ProxyCheck } from '@shared/types'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Field, Input } from './ui/field'
import { Select } from './ui/menus'

/** Estado editável (coordenadas como texto enquanto o usuário digita). */
export interface RegionDraft {
  mode: RegionMode
  timezone: string | null
  locale: string | null
  latitude: string
  longitude: string
  accuracy: string
}

const KEEP = '__keep__'

let zonesCache: string[] | null = null
function allTimezones(): string[] {
  if (!zonesCache) {
    try {
      zonesCache = Intl.supportedValuesOf('timeZone')
    } catch {
      zonesCache = ['UTC']
    }
  }
  return zonesCache
}

/** Converte o rascunho; devolve erro legível quando o número não é válido. */
export function parseRegionDraft(draft: RegionDraft):
  | { ok: true; value: { mode: RegionMode; timezone: string | null; locale: string | null; latitude: number | null; longitude: number | null; accuracy: number | null } }
  | { ok: false; error: string } {
  const num = (text: string): number | null | 'invalid' => {
    const t = text.trim().replace(',', '.')
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : 'invalid'
  }
  const latitude = num(draft.latitude)
  const longitude = num(draft.longitude)
  const accuracy = num(draft.accuracy)
  if (latitude === 'invalid' || longitude === 'invalid') return { ok: false, error: 'Coordenadas inválidas. Use números como -23.5505.' }
  if (accuracy === 'invalid') return { ok: false, error: 'Precisão inválida.' }
  const manual = draft.mode === 'manual'
  return {
    ok: true,
    value: {
      mode: draft.mode,
      timezone: manual ? draft.timezone : null,
      locale: manual ? draft.locale : null,
      latitude: manual ? latitude : null,
      longitude: manual ? longitude : null,
      accuracy: accuracy === null ? null : Math.round(accuracy)
    }
  }
}

function Summary({ check }: { check: ProxyCheck }) {
  const locale = localeForCountry(check.country)
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-control border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[12.5px]">
      <Clock className="mt-px size-3.5 text-muted" />
      <span>{check.timezone ?? 'Fuso não informado pelo serviço'}</span>
      <Languages className="mt-px size-3.5 text-muted" />
      <span>{locale ? (LOCALES.find((l) => l.value === locale)?.label ?? locale) : 'Idioma do computador (país sem idioma mapeado)'}</span>
      <MapPin className="mt-px size-3.5 text-muted" />
      <span className="font-mono text-[12px]">
        {check.latitude !== null && check.longitude !== null
          ? `${check.latitude.toFixed(4)}, ${check.longitude.toFixed(4)}`
          : 'Coordenadas não informadas'}
        {check.city ? <span className="ml-2 font-sans text-muted">{check.city}</span> : null}
      </span>
    </div>
  )
}

/** Seção "Região do navegador" do formulário de perfil. */
export function RegionSection({
  draft,
  onChange,
  error,
  hasProxy,
  proxyCheck
}: {
  draft: RegionDraft
  onChange(next: RegionDraft): void
  error?: string
  hasProxy: boolean
  /** Última verificação do proxy salvo selecionado (para pré-visualizar ou preencher o modo manual). */
  proxyCheck: ProxyCheck | null
}) {
  const set = <K extends keyof RegionDraft>(key: K, value: RegionDraft[K]): void => onChange({ ...draft, [key]: value })
  const timezoneOptions = useMemo(
    () => [{ value: KEEP, label: 'Não alterar (fuso do computador)' }, ...allTimezones().map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))],
    []
  )
  const localeOptions = useMemo(
    () => [{ value: KEEP, label: 'Não alterar (idioma do computador)' }, ...LOCALES.map((l) => ({ value: l.value, label: `${l.label} · ${l.value}` }))],
    []
  )

  const fillFromProxy = (): void => {
    if (!proxyCheck?.ok) return
    onChange({
      ...draft,
      timezone: proxyCheck.timezone ?? draft.timezone,
      locale: localeForCountry(proxyCheck.country) ?? draft.locale,
      latitude: proxyCheck.latitude !== null ? String(proxyCheck.latitude) : draft.latitude,
      longitude: proxyCheck.longitude !== null ? String(proxyCheck.longitude) : draft.longitude
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Região do navegador"
        error={error}
        hint={
          draft.mode === 'real'
            ? 'Fuso, idioma e localização do seu computador.'
            : draft.mode === 'proxy'
              ? 'Ao abrir, o proxy é verificado e o navegador recebe o fuso, o idioma do país e a localização do IP de saída. Se o proxy não responder, o navegador não abre.'
              : 'Escolha o fuso, o idioma e as coordenadas. Campos vazios não são alterados.'
        }
      >
        <div role="radiogroup" aria-label="Região do navegador" className="grid grid-cols-3 gap-1 rounded-control border border-white/10 bg-white/[0.03] p-1">
          {REGION_MODES.map((mode) => {
            const disabled = mode === 'proxy' && !hasProxy
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={draft.mode === mode}
                disabled={disabled}
                title={disabled ? 'Escolha um proxy acima para usar a região dele' : undefined}
                onClick={() => set('mode', mode)}
                className={cn(
                  'no-drag flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-3.5',
                  draft.mode === mode ? 'bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16)]' : 'text-muted hover:bg-white/[0.06] hover:text-white'
                )}
              >
                {mode === 'real' ? <Globe /> : mode === 'proxy' ? <Crosshair /> : <MapPin />}
                {REGION_MODE_LABEL[mode]}
              </button>
            )
          })}
        </div>
      </Field>

      {draft.mode === 'proxy' && proxyCheck?.ok && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-muted">Prévia pela última verificação (atualizada a cada abertura):</p>
          <Summary check={proxyCheck} />
        </div>
      )}

      {draft.mode === 'manual' && (
        <div className="flex flex-col gap-4 rounded-[14px] border border-white/8 bg-white/[0.025] p-3.5">
          {proxyCheck?.ok && (
            <Button size="sm" className="self-start" onClick={fillFromProxy}>
              <Crosshair />
              Preencher com a região do proxy
            </Button>
          )}
          <Field label="Fuso horário" htmlFor="region-timezone" hint="Com a lista aberta, digite o início para buscar (ex.: America/New).">

            <Select
              id="region-timezone"
              ariaLabel="Fuso horário"
              value={draft.timezone ?? KEEP}
              onChange={(v) => set('timezone', v === KEEP ? null : v)}
              options={timezoneOptions}
            />
          </Field>
          <Field label="Idioma" htmlFor="region-locale" hint="Idioma das páginas (Accept-Language), do navigator.language e da interface do navegador.">
            <Select
              id="region-locale"
              ariaLabel="Idioma"
              value={draft.locale ?? KEEP}
              onChange={(v) => set('locale', v === KEEP ? null : v)}
              options={localeOptions}
            />
          </Field>
          <div className="grid grid-cols-[1fr_1fr_96px] gap-2.5">
            <Field label="Latitude" htmlFor="region-lat" optional>
              <Input id="region-lat" value={draft.latitude} inputMode="decimal" placeholder="40.7128" onChange={(e) => set('latitude', e.target.value)} />
            </Field>
            <Field label="Longitude" htmlFor="region-lon" optional>
              <Input id="region-lon" value={draft.longitude} inputMode="decimal" placeholder="-74.0060" onChange={(e) => set('longitude', e.target.value)} />
            </Field>
            <Field label="Precisão (m)" htmlFor="region-acc">
              <Input
                id="region-acc"
                value={draft.accuracy}
                inputMode="numeric"
                placeholder={String(DEFAULT_GEO_ACCURACY)}
                onChange={(e) => set('accuracy', e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
          </div>
          <p className="text-[12px] text-muted/80">
            Dica: no Google Maps, clique com o botão direito em um local para copiar as coordenadas.
          </p>
        </div>
      )}
    </div>
  )
}

export function regionDraftFrom(region: {
  mode: RegionMode
  timezone: string | null
  locale: string | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
}): RegionDraft {
  return {
    mode: region.mode,
    timezone: region.timezone,
    locale: region.locale,
    latitude: region.latitude === null ? '' : String(region.latitude),
    longitude: region.longitude === null ? '' : String(region.longitude),
    accuracy: region.accuracy === null ? '' : String(region.accuracy)
  }
}
