// Baixa o Chromium gerenciado (Chrome for Testing, via Playwright) para
// resources/chromium e grava um manifesto com versão, tamanho e SHA-256 do
// executável. O manifesto é usado em runtime para verificar a instalação.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'resources', 'chromium')
const require = createRequire(import.meta.url)

const browsers = JSON.parse(
  readFileSync(join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8')
)
const chromium = browsers.browsers.find((b) => b.name === 'chromium')
if (!chromium) throw new Error('Chromium não encontrado em browsers.json do playwright-core')

function findExecutable(dir) {
  if (!existsSync(dir)) return null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findExecutable(full)
      if (found) return found
    } else if (entry.name.toLowerCase() === 'chrome.exe') {
      return full
    }
  }
  return null
}

function sha256(file) {
  return new Promise((ok, fail) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => ok(hash.digest('hex')))
      .on('error', fail)
  })
}

mkdirSync(target, { recursive: true })
const revisionDir = join(target, `chromium-${chromium.revision}`)
let executable = findExecutable(revisionDir)

if (!executable) {
  console.log(`Baixando Chromium ${chromium.browserVersion} (revisão ${chromium.revision})...`)
  const cli = join(dirname(require.resolve('playwright-core/package.json')), 'cli.js')
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium', '--no-shell'], {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: target }
  })
  if (result.status !== 0) {
    console.error('Falha ao baixar o Chromium. Verifique a conexão e tente novamente.')
    process.exit(result.status ?? 1)
  }
  executable = findExecutable(revisionDir)
}

if (!executable) {
  console.error(`chrome.exe não encontrado em ${revisionDir} após a instalação.`)
  process.exit(1)
}

const manifest = {
  version: chromium.browserVersion,
  revision: chromium.revision,
  executable: relative(target, executable).replace(/\\/g, '/'),
  size: statSync(executable).size,
  sha256: await sha256(executable)
}
writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`Chromium ${manifest.version} pronto em resources/chromium (${manifest.executable}).`)
