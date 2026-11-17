import { FolderOpen, Minus, Plus, ShieldCheck, Square } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/common'
import { ConfirmDialog } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/menus'
import logoUrl from '@/assets/logo.png'
import { call, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { selectOpenCount, useApp } from '@/store'

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="glass shrink-0 overflow-hidden">
      <header className="border-b border-white/8 px-6 py-4">
        <h2 className="text-[14.5px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>
      </header>
      <div className="divide-y divide-white/[0.06]">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center justify-between gap-8 px-6 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function PathValue({ value }: { value: string | undefined }) {
  return (
    <code
      title={value}
      className="max-w-[440px] select-text truncate rounded-lg border border-white/8 bg-black/25 px-2.5 py-1.5 font-mono text-[12px] text-white/80"
    >
      {value ?? '—'}
    </code>
  )
}

export function SettingsPage() {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const appInfo = useApp((s) => s.appInfo)
  const chromium = useApp((s) => s.chromium)
  const openCount = useApp(selectOpenCount)
  const toast = useApp((s) => s.toast)
  const [verifying, setVerifying] = useState(false)
  const [confirmCloseAll, setConfirmCloseAll] = useState(false)

  const verify = async (): Promise<void> => {
    setVerifying(true)
    try {
      const info = await call('chromium:verify')
      useApp.setState({ chromium: info })
      toast(info.installed ? 'success' : 'error', info.message)
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setVerifying(false)
    }
  }

  const setLimit = (value: number): void => {
    const next = Math.min(50, Math.max(1, value))
    if (next !== settings.maxConcurrentBrowsers) void update({ maxConcurrentBrowsers: next })
  }

  const integrityLabel =
    chromium?.integrity === 'ok'
      ? 'Íntegro'
      : chromium?.integrity === 'not_checked'
        ? 'Instalado'
        : chromium?.integrity === 'mismatch'
          ? 'Corrompido'
          : 'Não encontrado'

  return (
    <>
      <PageHeader title="Configurações" subtitle="Preferências do aplicativo. Tudo fica salvo neste computador." />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2 pr-1">
        <Section title="Geral" description="Comportamento do painel.">
          <Row label="Iniciar maximizado" hint="A janela do painel abre ocupando toda a tela.">
            <Switch ariaLabel="Iniciar maximizado" checked={settings.startMaximized} onChange={(v) => void update({ startMaximized: v })} />
          </Row>
          <Row label="Confirmar antes de fechar navegadores" hint="Ao sair do painel com navegadores ativos, pergunta antes de encerrá-los.">
            <Switch
              ariaLabel="Confirmar antes de fechar navegadores"
              checked={settings.confirmBeforeClosing}
              onChange={(v) => void update({ confirmBeforeClosing: v })}
            />
          </Row>
          <Row label="Abrir na última página utilizada" hint="Retoma o painel na seção em que você estava.">
            <Switch ariaLabel="Abrir na última página utilizada" checked={settings.reopenLastPage} onChange={(v) => void update({ reopenLastPage: v })} />
          </Row>
          <Row label="Tema" hint="O tema escuro é o padrão do Zenx MultiLogin.">
            <span className="rounded-lg border border-white/8 bg-white/[0.05] px-2.5 py-1.5 text-[12.5px] text-white/80">Escuro</span>
          </Row>
          <Row label="Diretório de dados" hint="Banco de dados e perfis de navegador. Somente leitura nesta versão.">
            <PathValue value={appInfo?.dataDir} />
            <Button size="icon" aria-label="Abrir pasta de dados" title="Abrir pasta de dados" onClick={() => void call('app:openDataDir').catch((e) => toast('error', errorMessage(e)))}>
              <FolderOpen />
            </Button>
          </Row>
        </Section>

        <Section title="Navegadores" description="Chromium gerenciado e limites de uso.">
          <Row label="Limite de navegadores simultâneos" hint="Quantos perfis podem ficar abertos ao mesmo tempo. O ideal depende da memória do computador.">
            <Button size="icon" aria-label="Diminuir limite" disabled={settings.maxConcurrentBrowsers <= 1} onClick={() => setLimit(settings.maxConcurrentBrowsers - 1)}>
              <Minus />
            </Button>
            <span className="w-9 text-center text-[14px] font-semibold tabular-nums" aria-live="polite">
              {settings.maxConcurrentBrowsers}
            </span>
            <Button size="icon" aria-label="Aumentar limite" disabled={settings.maxConcurrentBrowsers >= 50} onClick={() => setLimit(settings.maxConcurrentBrowsers + 1)}>
              <Plus />
            </Button>
          </Row>
          <Row label="Avisos de alto consumo" hint="Avisa quando muitos navegadores estiverem abertos ao mesmo tempo.">
            <Switch ariaLabel="Avisos de alto consumo" checked={settings.showResourceWarnings} onChange={(v) => void update({ showResourceWarnings: v })} />
          </Row>
          <Row label="Chromium instalado" hint={chromium?.executablePath ?? chromium?.message}>
            <span
              className={cn(
                'rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium',
                chromium?.installed ? 'border-success/25 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
              )}
            >
              {chromium?.version ? `${chromium.version} · ${integrityLabel}` : integrityLabel}
            </span>
            <Button loading={verifying} onClick={() => void verify()}>
              <ShieldCheck />
              Verificar instalação
            </Button>
          </Row>
          <Row label="Encerrar todos os navegadores" hint="Fecha todos os perfis abertos. As sessões permanecem salvas.">
            <Button variant="danger" disabled={openCount === 0} onClick={() => setConfirmCloseAll(true)}>
              <Square />
              Encerrar todos ({openCount})
            </Button>
          </Row>
        </Section>

        <Section title="Sobre" description="Informações desta instalação.">
          <div className="flex items-center gap-4 px-6 py-5">
            <img src={logoUrl} alt="" draggable={false} className="size-12 rounded-[13px] shadow-[0_8px_26px_-8px_rgb(4_62_230/0.9)]" />
            <div>
              <p className="text-[15px] font-semibold">Zenx MultiLogin</p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Versão {appInfo?.version ?? '—'} · Electron {appInfo?.electronVersion ?? '—'} + Chromium {chromium?.version ?? '—'}
              </p>
            </div>
          </div>
          <Row label="Arquivos do aplicativo">
            <PathValue value={appInfo?.appPath} />
          </Row>
          <Row label="Banco de dados local">
            <PathValue value={appInfo?.databaseFile} />
          </Row>
          <Row label="Perfis de navegador">
            <PathValue value={appInfo?.profilesDir} />
          </Row>
          <div className="px-6 py-4 text-[12.5px] leading-relaxed text-muted">
            Cada perfil usa um diretório e processos de navegador próprios. Isso separa cookies e sessões entre perfis, mas não é uma
            garantia de anonimato: os sites ainda podem relacionar contas por IP, dispositivo ou comportamento.
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmCloseAll}
        title="Encerrar todos os navegadores?"
        description={`${openCount} ${openCount === 1 ? 'navegador será encerrado' : 'navegadores serão encerrados'}. As sessões ficam salvas nos perfis.`}
        confirmLabel="Encerrar todos"
        onCancel={() => setConfirmCloseAll(false)}
        onConfirm={async () => {
          await useApp.getState().closeAll()
          setConfirmCloseAll(false)
        }}
      />
    </>
  )
}
