/**
 * Teste ponta a ponta: inicia o aplicativo Electron a partir do build de produção
 * (out/), com uma pasta de dados temporária, e exercita o fluxo principal pela interface.
 * Requer `npm run build` antes (o script `npm test` já faz isso).
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let app: ElectronApplication
let page: Page
let dataDir: string
const consoleErrors: string[] = []

beforeAll(async () => {
  if (!existsSync(resolve('out/main/index.js'))) throw new Error('Execute "npm run build" antes do teste e2e.')
  dataDir = await mkdtemp(join(tmpdir(), 'zenx-e2e-'))
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ZENX_DATA_DIR: dataDir }
  delete env.ELECTRON_RENDERER_URL
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [resolve('.')], env })
  page = await app.firstWindow()
  page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()))
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
})

afterAll(async () => {
  await app?.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined)
  await app?.close().catch(() => undefined)
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => undefined)
})

describe('aplicativo desktop', () => {
  it('abre o painel em janela própria, a partir de arquivos locais, sem servidor localhost', async () => {
    const url = page.url()
    expect(url.startsWith('file:///')).toBe(true)
    expect(url).toMatch(/out\/renderer\/index\.html$/)
    expect(url).not.toMatch(/localhost|127\.0\.0\.1/)
    expect(await page.title()).toBe('Zenx MultiLogin')
    const size = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return { count: BrowserWindow.getAllWindows().length, min: win?.getMinimumSize() }
    })
    expect(size).toEqual({ count: 1, min: [1100, 700] })
  })

  it('cria o banco SQLite automaticamente no primeiro uso, fora da pasta do app', async () => {
    expect(existsSync(join(dataDir, 'database', 'zenx.db'))).toBe(true)
  })

  it('aplica as proteções de segurança do renderer', async () => {
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> } | undefined
      const p = contents?.getLastWebPreferences()
      return { contextIsolation: p?.contextIsolation, nodeIntegration: p?.nodeIntegration, sandbox: p?.sandbox }
    })
    expect(prefs).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true })

    const renderer = await page.evaluate(async () => {
      const w = window as unknown as Record<string, unknown>
      const bridge = w.zenx as { invoke(channel: string, payload?: unknown): Promise<{ ok: boolean; error?: { code: string } }> }
      return {
        hasRequire: typeof w.require !== 'undefined',
        hasProcess: typeof w.process !== 'undefined',
        bridgeKeys: Object.keys(bridge).sort(),
        unknownChannel: await bridge.invoke('fs:readFile', { path: 'C:/Windows/win.ini' }),
        traversal: await bridge.invoke('profiles:delete', { id: '../../Windows' }),
        badUrl: await bridge.invoke('profiles:create', {
          name: 'x', platform: 'other', username: '', homeUrl: 'file:///C:/', groupId: null, tags: [], notes: ''
        }),
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? ''
      }
    })
    expect(renderer.hasRequire).toBe(false)
    expect(renderer.hasProcess).toBe(false)
    expect(renderer.bridgeKeys).toEqual(['invoke', 'on'])
    expect(renderer.unknownChannel).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(renderer.traversal).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(renderer.badUrl).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(renderer.csp).toContain("default-src 'none'")
    expect(renderer.csp).toContain("script-src 'self'")
  })

  it('mostra indicadores reais e o estado vazio no primeiro uso', async () => {
    await expect.poll(() => page.getByText('Perfis cadastrados').count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Criar meu primeiro perfil' }).count()).toBe(1)
  })

  it('cria um perfil pela interface e ele aparece imediatamente na listagem', async () => {
    await page.getByRole('button', { name: 'Novo perfil', exact: true }).click()
    await page.locator('#profile-name').fill('Teste E2E 01')
    const platforms = page.getByRole('group', { name: 'Plataformas' })
    // Várias plataformas: TikTok e YouTube além do Instagram padrão.
    await platforms.getByRole('button', { name: /TikTok/ }).click()
    await platforms.getByRole('button', { name: /YouTube/ }).click()
    expect(await page.locator('#profile-url').inputValue()).toBe('https://www.instagram.com/')
    // Remover a principal faz a URL acompanhar a nova principal (TikTok).
    await platforms.getByRole('button', { name: /Instagram/ }).click()
    expect(await page.locator('#profile-url').inputValue()).toBe('https://www.tiktok.com/')
    // Uma URL que não seja HTTPS impede o envio; deixamos o campo vazio para não acessar a internet.
    await page.locator('#profile-url').fill('')
    await page.locator('#profile-username').fill('conta_e2e')
    await page.getByRole('button', { name: 'Criar perfil', exact: true }).click()

    await page.getByRole('heading', { name: 'Perfil criado' }).waitFor()
    await page.getByRole('button', { name: 'Agora não' }).click()

    await page.getByRole('navigation').getByRole('button', { name: /Perfis/ }).click()
    const rows = page.getByTestId('profile-row')
    await expect.poll(() => rows.count()).toBe(1)
    expect(await rows.first().innerText()).toContain('Teste E2E 01')
    expect(await rows.first().innerText()).toContain('Fechado')
    expect(await rows.first().locator('[title="TikTok, YouTube"]').count()).toBe(1)

    const profileDirs = await readdir(join(dataDir, 'profiles'))
    expect(profileDirs).toHaveLength(1)
    expect(profileDirs[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(existsSync(join(dataDir, 'profiles', profileDirs[0] as string, 'user-data'))).toBe(true)
  })

  it('valida o formulário (nome obrigatório e URL somente HTTPS)', async () => {
    await page.getByRole('button', { name: 'Novo perfil', exact: true }).click()
    await page.locator('#profile-url').fill('http://inseguro.example')
    await page.getByRole('button', { name: 'Criar perfil', exact: true }).click()
    await page.getByText('Informe o nome do perfil').waitFor()
    await page.getByText('Informe uma URL HTTPS válida').waitFor()
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await expect.poll(() => page.getByTestId('profile-row').count()).toBe(1)
  })

  it('pesquisa global filtra a tabela', async () => {
    const search = page.getByLabel('Busca global de perfis')
    await search.fill('inexistente')
    await page.getByText('Nenhum perfil encontrado').waitFor()
    await search.fill('conta_e2e')
    await expect.poll(() => page.getByTestId('profile-row').count()).toBe(1)
    await search.fill('')
  })

  it('abre um Chromium real para o perfil, reflete o status e detecta o encerramento', async () => {
    const row = page.getByTestId('profile-row').first()
    const open = row.getByRole('button', { name: 'Abrir', exact: true })
    await open.dblclick() // clique duplo rápido não pode abrir duplicatas
    await row.getByRole('button', { name: 'Focar' }).waitFor({ timeout: 60_000 })
    expect(await row.innerText()).toContain('Aberto')
    await page.getByText('1 aberto', { exact: true }).waitFor()

    const profileId = (await readdir(join(dataDir, 'profiles')))[0] as string
    expect(existsSync(join(dataDir, 'profiles', profileId, 'user-data', 'Default'))).toBe(true)

    await row.getByRole('button', { name: /Mais ações/ }).click()
    await page.getByRole('menuitem', { name: 'Fechar navegador' }).click()
    await row.getByRole('button', { name: 'Abrir', exact: true }).waitFor({ timeout: 30_000 })
    expect(await row.innerText()).toContain('Fechado')
    expect(await row.innerText()).not.toContain('Nunca')
  })

  it('adiciona proxy colando a linha, guarda a senha cifrada e vincula ao perfil', async () => {
    await page.getByRole('navigation').getByRole('button', { name: /Proxies/ }).click()
    await page.getByText('Nenhum proxy salvo').waitFor()
    await page.getByRole('button', { name: 'Adicionar proxy', exact: true }).click()
    await page.locator('#proxy-paste').fill('127.0.0.1:9:cliente01:segredo123')
    await page.locator('#proxy-paste').press('Enter')
    expect(await page.locator('#proxy-host').inputValue()).toBe('127.0.0.1')
    expect(await page.locator('#proxy-port').inputValue()).toBe('9')
    expect(await page.locator('#proxy-user').inputValue()).toBe('cliente01')
    await page.locator('#proxy-name').fill('Residencial E2E')
    // A porta 9 está fechada: a verificação mostra o erro sem travar o formulário.
    await page.getByRole('button', { name: 'Verificar proxy' }).click()
    await page.getByText(/recusada|não respondeu|encerrou/).waitFor({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Adicionar proxy', exact: true }).click()
    await expect.poll(() => page.getByTestId('proxy-row').count()).toBe(1)
    expect(await page.getByTestId('proxy-row').first().innerText()).toContain('Residencial E2E')

    const db = [join(dataDir, 'database', 'zenx.db'), join(dataDir, 'database', 'zenx.db-wal')]
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file).toString('latin1'))
      .join('')
    expect(db).not.toContain('segredo123')

    await page.getByRole('navigation').getByRole('button', { name: /Perfis/ }).click()
    const row = page.getByTestId('profile-row').first()
    await row.getByRole('button', { name: /Mais ações/ }).click()
    await page.getByRole('menuitem', { name: 'Editar' }).click()
    await page.getByRole('radio', { name: 'Proxy salvo' }).click()
    await page.getByRole('combobox', { name: 'Proxy salvo' }).click()
    await page.getByRole('option', { name: /Residencial E2E/ }).click()
    // Escolher um proxy faz a região seguir o IP dele.
    expect(await page.getByRole('radio', { name: /Pelo IP do proxy/ }).getAttribute('aria-checked')).toBe('true')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect.poll(() => row.innerText()).toContain('Residencial E2E')

    // Proxy fora do ar: o navegador não abre, para não expor a localização real.
    await row.getByRole('button', { name: 'Abrir', exact: true }).click()
    await page.getByText(/O proxy não respondeu/).first().waitFor({ timeout: 30_000 })
    expect(await row.innerText()).toContain('Erro')
  })

  it('não gera erros de console nem violações de CSP', () => {
    expect(consoleErrors).toEqual([])
  })
})
