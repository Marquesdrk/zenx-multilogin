import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, session, shell, type IpcMainInvokeEvent } from 'electron'
import { AppError } from '@shared/errors'
import type { IpcEventName, IpcEvents } from '@shared/ipc'
import type { BrowserState } from '@shared/types'
import { registerIpc } from './ipc/registerIpc'
import { buildPaths, resolveDataRoot } from './paths'
import { BrowserManager } from './services/BrowserManager'
import { ChromiumLocator } from './services/ChromiumLocator'
import { DatabaseService } from './services/DatabaseService'
import { EventLogger } from './services/EventLogger'
import { GroupManager } from './services/GroupManager'
import { ProfileManager } from './services/ProfileManager'
import { SettingsService } from './services/SettingsService'

const APP_NAME = 'Zenx MultiLogin'
const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
const indexHtml = join(__dirname, '../renderer/index.html')

// Recursos somente leitura distribuídos com o app (migrações, Chromium, ícone).
const resourcesRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
const dataRoot = resolveDataRoot()
const paths = buildPaths(
  dataRoot,
  join(resourcesRoot, 'drizzle'),
  app.isPackaged ? join(resourcesRoot, 'chromium') : join(resourcesRoot, 'resources', 'chromium')
)
const iconPath = app.isPackaged ? join(resourcesRoot, 'icon.png') : join(resourcesRoot, 'build', 'icon.png')

// Dados internos do Electron (cache do painel) também ficam fora da pasta do executável.
app.setName(APP_NAME)
app.setPath('userData', join(dataRoot, 'panel'))
app.setAppUserModelId('com.zenx.multilogin')

let mainWindow: BrowserWindow | null = null
let allowClose = false

function send<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(event, payload)
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname}`.toLowerCase()
  } catch {
    return ''
  }
}

/** Aceita mensagens IPC somente do frame principal do painel, carregado do próprio app. */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (!frame || !mainWindow || mainWindow.isDestroyed()) return false
  if (event.sender !== mainWindow.webContents || frame !== mainWindow.webContents.mainFrame) return false
  if (devServerUrl) return new URL(frame.url).origin === new URL(devServerUrl).origin
  return normalizeUrl(frame.url) === normalizeUrl(pathToFileURL(indexHtml).href)
}

function requireWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) throw new AppError('INTERNAL', 'Janela indisponível.')
  return mainWindow
}

async function bootstrap(): Promise<void> {
  const database = await DatabaseService.open(paths.databaseFile, paths.migrationsDir)
  const events = new EventLogger(database.db)
  const settings = new SettingsService(database.db)
  const profiles = new ProfileManager(database.db, paths, events)
  const groups = new GroupManager(database.db, events)
  const chromium = new ChromiumLocator(paths.chromiumRoot)
  const browsers = new BrowserManager({
    getProfile: (id) => profiles.get(id),
    resolveUserDataDir: (id) => profiles.userDataDir(id),
    resolveExecutable: () => chromium.requireExecutable(),
    getMaxOpen: async () => (await settings.get()).maxConcurrentBrowsers,
    markOpened: (id) => profiles.markOpened(id),
    logEvent: (type, message, profileId) => events.log(type, message, profileId)
  })
  browsers.on('state', (id: string, state: BrowserState) => send('browser:state', { id, state }))

  const closeAllAndQuit = async (): Promise<void> => {
    await browsers.closeAll()
    allowClose = true
    mainWindow?.close()
  }

  registerIpc(
    {
      'profiles:list': () => profiles.list(),
      'profiles:create': (input) => profiles.create(input),
      'profiles:update': ({ id, data }) => profiles.update(id, data),
      'profiles:delete': async ({ id }) => {
        await browsers.close(id) // nunca apaga o diretório de um navegador em execução
        await profiles.delete(id)
      },
      'profiles:duplicate': ({ id }) => profiles.duplicate(id),
      'groups:list': () => groups.list(),
      'groups:create': (input) => groups.create(input),
      'groups:update': ({ id, data }) => groups.update(id, data),
      'groups:delete': ({ id }) => groups.delete(id),
      'tags:list': () => profiles.listTags(),
      'events:list': ({ limit }) => events.list(limit),
      'browser:states': () => browsers.getStates(),
      'browser:open': ({ id }) => browsers.open(id),
      'browser:focus': ({ id }) => browsers.focus(id),
      'browser:close': ({ id }) => browsers.close(id),
      'browser:openMany': async ({ ids }) => {
        const results = await Promise.allSettled(ids.map((id) => browsers.open(id)))
        const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        const first = failures[0]
        if (first) {
          const reason = first.reason instanceof AppError ? first.reason.message : 'Falha ao iniciar.'
          throw new AppError(
            'LAUNCH_FAILED',
            failures.length === 1 ? reason : `${failures.length} perfis não abriram. ${reason}`
          )
        }
      },
      'browser:closeMany': ({ ids }) => browsers.closeMany(ids),
      'browser:closeAll': () => browsers.closeAll(),
      'chromium:verify': () => chromium.info(true),
      'chromium:info': () => chromium.info(false),
      'settings:get': () => settings.get(),
      'settings:update': (patch) => settings.update(patch),
      'app:info': () => ({
        name: APP_NAME,
        version: app.getVersion(),
        electronVersion: process.versions.electron ?? '',
        panelChromiumVersion: process.versions.chrome ?? '',
        dataDir: paths.root,
        databaseFile: paths.databaseFile,
        profilesDir: paths.profilesRoot,
        appPath: app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath(),
        packaged: app.isPackaged
      }),
      'app:openDataDir': async () => {
        const error = await shell.openPath(paths.root) // caminho fixo, nunca vindo da interface
        if (error) throw new AppError('INTERNAL', 'Não foi possível abrir a pasta de dados.')
      },
      'app:confirmQuit': () => closeAllAndQuit(),
      'window:minimize': () => requireWindow().minimize(),
      'window:toggleMaximize': () => {
        const win = requireWindow()
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
        return win.isMaximized()
      },
      'window:isMaximized': () => requireWindow().isMaximized(),
      'window:close': () => requireWindow().close()
    },
    isTrustedSender
  )

  const current = await settings.get()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#080A0F',
    title: APP_NAME,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged,
      spellcheck: false
    }
  })
  mainWindow = win

  win.once('ready-to-show', () => {
    if (current.startMaximized) win.maximize()
    win.show()
  })
  win.on('maximize', () => send('window:maximized', true))
  win.on('unmaximize', () => send('window:maximized', false))

  // Ao fechar o painel com navegadores ativos: confirma ou encerra todos antes de sair.
  win.on('close', (event) => {
    if (allowClose) return
    const openCount = browsers.activeCount()
    if (openCount === 0) return
    event.preventDefault()
    void settings.get().then((s) => {
      if (!s.confirmBeforeClosing) return closeAllAndQuit()
      if (win.isMinimized()) win.restore()
      win.focus()
      send('app:closeRequested', { openCount })
    })
  })
  win.on('closed', () => {
    mainWindow = null
  })

  app.on('window-all-closed', () => {
    void browsers.closeAll().finally(() => {
      database.close()
      app.quit()
    })
  })

  if (devServerUrl) await win.loadURL(devServerUrl)
  else await win.loadFile(indexHtml) // produção: arquivos locais empacotados, sem servidor HTTP
}

// O painel nunca navega para fora, abre janelas, usa <webview> nem recebe permissões.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl
      ? new URL(url).origin === new URL(devServerUrl).origin
      : normalizeUrl(url) === normalizeUrl(pathToFileURL(indexHtml).href)
    if (!allowed) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  void app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    try {
      await bootstrap()
    } catch (error) {
      console.error('[main] falha na inicialização:', error instanceof Error ? error.message : error)
      dialog.showErrorBox(
        APP_NAME,
        'Não foi possível iniciar o aplicativo. Verifique se a pasta de dados está acessível e tente novamente.'
      )
      app.exit(1)
    }
  })
}
