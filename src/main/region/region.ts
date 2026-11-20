import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { acceptLanguages } from '@shared/region'
import { REGION_INJECT_SOURCE } from './inject'

/** Região efetivamente aplicada a um navegador. Campos nulos não são alterados. */
export interface RegionConfig {
  timezone: string | null
  locale: string | null
  geo: { latitude: number; longitude: number; accuracy: number } | null
}

const EXTENSION_DIR = 'region-extension'
const MARKER = 'zenx_region_languages'

export function regionExtensionDir(userDataDir: string): string {
  return join(dirname(userDataDir), EXTENSION_DIR)
}

/** Extensão local (Manifest V3) que injeta o script de região em todas as páginas e frames. */
export async function writeRegionExtension(dir: string, config: RegionConfig): Promise<void> {
  await mkdir(dir, { recursive: true })
  const manifest = {
    manifest_version: 3,
    name: 'Zenx Region',
    description: 'Fuso horário e geolocalização deste perfil (Zenx MultiLogin).',
    version: '1.0.0',
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['region.js'],
        run_at: 'document_start',
        all_frames: true,
        match_about_blank: true,
        match_origin_as_fallback: true,
        world: 'MAIN'
      }
    ]
  }
  const payload = JSON.stringify({ timezone: config.timezone, geo: config.geo })
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await writeFile(join(dir, 'region.js'), `;(${REGION_INJECT_SOURCE})(${payload});\n`)
}

/**
 * Ajusta os idiomas do perfil (Accept-Language e navigator.languages) no arquivo de
 * preferências, com o navegador fechado. Com `locale` nulo, desfaz apenas o que o app aplicou.
 */
export async function applyLanguagePreference(userDataDir: string, locale: string | null): Promise<void> {
  const file = join(userDataDir, 'Default', 'Preferences')
  let prefs: Record<string, unknown> = {}
  try {
    prefs = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return // arquivo ilegível: não arrisca sobrescrever
    if (!locale) return
  }
  const intl = (typeof prefs.intl === 'object' && prefs.intl !== null ? prefs.intl : {}) as Record<string, unknown>
  const applied = prefs[MARKER]
  if (locale) {
    const value = acceptLanguages(locale)
    intl.accept_languages = value
    intl.selected_languages = value
    prefs.intl = intl
    prefs[MARKER] = value
  } else {
    if (typeof applied !== 'string') return
    if (intl.accept_languages === applied) delete intl.accept_languages
    if (intl.selected_languages === applied) delete intl.selected_languages
    delete prefs[MARKER]
    prefs.intl = intl
  }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(prefs))
}

/** Prepara arquivos e devolve os argumentos do Chromium para a região do perfil. */
export async function prepareRegion(userDataDir: string, config: RegionConfig | null): Promise<string[]> {
  const dir = regionExtensionDir(userDataDir)
  const args: string[] = []
  if (config && (config.timezone || config.geo)) {
    await writeRegionExtension(dir, config)
    args.push(`--load-extension=${dir}`)
  } else {
    await rm(dir, { recursive: true, force: true })
  }
  await applyLanguagePreference(userDataDir, config?.locale ?? null)
  if (config?.locale) args.push(`--lang=${config.locale}`)
  return args
}
