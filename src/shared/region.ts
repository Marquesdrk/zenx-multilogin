/** Região simulada do navegador: fuso horário, idioma e geolocalização. */
export const REGION_MODES = ['real', 'proxy', 'manual'] as const
export type RegionMode = (typeof REGION_MODES)[number]

export const REGION_MODE_LABEL: Record<RegionMode, string> = {
  real: 'Do computador',
  proxy: 'Pelo IP do proxy',
  manual: 'Manual'
}

export interface RegionSettings {
  mode: RegionMode
  /** IANA, ex.: America/New_York. Nulo = não altera. */
  timezone: string | null
  /** BCP 47, ex.: en-US. Nulo = não altera. */
  locale: string | null
  latitude: number | null
  longitude: number | null
  /** Precisão informada pela geolocalização, em metros. */
  accuracy: number | null
}

export const DEFAULT_REGION: RegionSettings = {
  mode: 'real',
  timezone: null,
  locale: null,
  latitude: null,
  longitude: null,
  accuracy: null
}

export const DEFAULT_GEO_ACCURACY = 100

/** Idiomas oferecidos no modo manual. */
export const LOCALES: { value: string; label: string }[] = [
  { value: 'en-US', label: 'Inglês (Estados Unidos)' },
  { value: 'en-GB', label: 'Inglês (Reino Unido)' },
  { value: 'en-CA', label: 'Inglês (Canadá)' },
  { value: 'en-AU', label: 'Inglês (Austrália)' },
  { value: 'en-IN', label: 'Inglês (Índia)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'es-ES', label: 'Espanhol (Espanha)' },
  { value: 'es-MX', label: 'Espanhol (México)' },
  { value: 'es-AR', label: 'Espanhol (Argentina)' },
  { value: 'es-CO', label: 'Espanhol (Colômbia)' },
  { value: 'es-CL', label: 'Espanhol (Chile)' },
  { value: 'fr-FR', label: 'Francês (França)' },
  { value: 'fr-CA', label: 'Francês (Canadá)' },
  { value: 'de-DE', label: 'Alemão (Alemanha)' },
  { value: 'it-IT', label: 'Italiano (Itália)' },
  { value: 'nl-NL', label: 'Holandês (Países Baixos)' },
  { value: 'pl-PL', label: 'Polonês (Polônia)' },
  { value: 'ru-RU', label: 'Russo (Rússia)' },
  { value: 'uk-UA', label: 'Ucraniano (Ucrânia)' },
  { value: 'tr-TR', label: 'Turco (Turquia)' },
  { value: 'ar-SA', label: 'Árabe (Arábia Saudita)' },
  { value: 'ar-AE', label: 'Árabe (Emirados Árabes)' },
  { value: 'he-IL', label: 'Hebraico (Israel)' },
  { value: 'hi-IN', label: 'Hindi (Índia)' },
  { value: 'ja-JP', label: 'Japonês (Japão)' },
  { value: 'ko-KR', label: 'Coreano (Coreia do Sul)' },
  { value: 'zh-CN', label: 'Chinês (China)' },
  { value: 'zh-TW', label: 'Chinês (Taiwan)' },
  { value: 'th-TH', label: 'Tailandês (Tailândia)' },
  { value: 'vi-VN', label: 'Vietnamita (Vietnã)' },
  { value: 'id-ID', label: 'Indonésio (Indonésia)' },
  { value: 'ms-MY', label: 'Malaio (Malásia)' },
  { value: 'fil-PH', label: 'Filipino (Filipinas)' },
  { value: 'sv-SE', label: 'Sueco (Suécia)' },
  { value: 'nb-NO', label: 'Norueguês (Noruega)' },
  { value: 'da-DK', label: 'Dinamarquês (Dinamarca)' },
  { value: 'fi-FI', label: 'Finlandês (Finlândia)' },
  { value: 'cs-CZ', label: 'Tcheco (República Tcheca)' },
  { value: 'ro-RO', label: 'Romeno (Romênia)' },
  { value: 'hu-HU', label: 'Húngaro (Hungria)' },
  { value: 'el-GR', label: 'Grego (Grécia)' }
]

/** Idioma principal por país (código ISO 3166-1), usado no modo "Pelo IP do proxy". */
const COUNTRY_LOCALE: Record<string, string> = {
  US: 'en-US', GB: 'en-GB', CA: 'en-CA', AU: 'en-AU', NZ: 'en-NZ', IE: 'en-IE', ZA: 'en-ZA', IN: 'en-IN',
  SG: 'en-SG', NG: 'en-NG', KE: 'en-KE', PH: 'fil-PH', BR: 'pt-BR', PT: 'pt-PT', AO: 'pt-AO', MZ: 'pt-MZ',
  ES: 'es-ES', MX: 'es-MX', AR: 'es-AR', CO: 'es-CO', CL: 'es-CL', PE: 'es-PE', VE: 'es-VE', EC: 'es-EC',
  UY: 'es-UY', PY: 'es-PY', BO: 'es-BO', CR: 'es-CR', DO: 'es-DO', GT: 'es-GT', PA: 'es-PA', FR: 'fr-FR',
  BE: 'fr-BE', CH: 'de-CH', LU: 'fr-LU', MA: 'fr-MA', SN: 'fr-SN', DE: 'de-DE', AT: 'de-AT', IT: 'it-IT',
  NL: 'nl-NL', PL: 'pl-PL', RU: 'ru-RU', UA: 'uk-UA', BY: 'ru-BY', KZ: 'ru-KZ', TR: 'tr-TR', SA: 'ar-SA',
  AE: 'ar-AE', EG: 'ar-EG', QA: 'ar-QA', KW: 'ar-KW', IL: 'he-IL', IR: 'fa-IR', PK: 'ur-PK', BD: 'bn-BD',
  JP: 'ja-JP', KR: 'ko-KR', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK', TH: 'th-TH', VN: 'vi-VN', ID: 'id-ID',
  MY: 'ms-MY', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', FI: 'fi-FI', IS: 'is-IS', CZ: 'cs-CZ', SK: 'sk-SK',
  RO: 'ro-RO', HU: 'hu-HU', GR: 'el-GR', BG: 'bg-BG', RS: 'sr-RS', HR: 'hr-HR', SI: 'sl-SI', LT: 'lt-LT',
  LV: 'lv-LV', EE: 'et-EE', GE: 'ka-GE', AM: 'hy-AM', AZ: 'az-AZ'
}

export function localeForCountry(country: string | null): string | null {
  return country ? (COUNTRY_LOCALE[country.toUpperCase()] ?? null) : null
}

/** Lista Accept-Language: "en-US,en". */
export function acceptLanguages(locale: string): string {
  const base = locale.split('-')[0] ?? locale
  return base && base !== locale ? `${locale},${base}` : locale
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function isValidLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}
