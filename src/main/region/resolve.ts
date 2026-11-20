import { AppError } from '@shared/errors'
import { DEFAULT_GEO_ACCURACY, localeForCountry, type RegionSettings } from '@shared/region'
import type { ProxyDTO } from '@shared/types'
import type { RegionConfig } from './region'

/**
 * Decide a região aplicada ao abrir o navegador.
 * - real: nada é alterado.
 * - manual: usa os valores do perfil (campos vazios não são alterados).
 * - proxy: verifica o proxy agora (o IP pode ter mudado) e usa fuso, idioma do país e
 *   coordenadas do IP de saída. Se o proxy não responder, o navegador NÃO é aberto,
 *   para não expor a localização real do computador.
 */
export async function resolveRegionConfig(
  profile: { region: RegionSettings; proxyId: string | null },
  checkProxy: (proxyId: string) => Promise<ProxyDTO>
): Promise<RegionConfig | null> {
  const region = profile.region
  const accuracy = region.accuracy ?? DEFAULT_GEO_ACCURACY
  if (region.mode === 'manual') {
    const geo =
      region.latitude !== null && region.longitude !== null
        ? { latitude: region.latitude, longitude: region.longitude, accuracy }
        : null
    if (!region.timezone && !region.locale && !geo) return null
    return { timezone: region.timezone, locale: region.locale, geo }
  }
  if (region.mode === 'proxy') {
    if (!profile.proxyId) {
      throw new AppError('VALIDATION', 'Este perfil usa a região do proxy, mas não tem proxy. Edite o perfil.')
    }
    const check = (await checkProxy(profile.proxyId)).lastCheck
    if (!check?.ok) {
      throw new AppError(
        'PROXY_FAILED',
        `O proxy não respondeu (${check?.error ?? 'falha na conexão'}). O navegador não foi aberto para não expor sua localização real.`
      )
    }
    const geo =
      check.latitude !== null && check.longitude !== null
        ? { latitude: check.latitude, longitude: check.longitude, accuracy }
        : null
    return { timezone: check.timezone, locale: localeForCountry(check.country), geo }
  }
  return null
}
