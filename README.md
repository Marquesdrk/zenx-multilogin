# Zenx MultiLogin

Aplicativo desktop para Windows 10/11 (x64) que gerencia perfis de navegador isolados.
Cada perfil abre um **Chromium real e independente**, com cookies, localStorage e sessões
próprios, para você fazer login manualmente e reutilizar a sessão depois.

Tudo fica no computador: sem servidor, sem nuvem, sem login no painel.

## Instalação (usuário final)

1. Execute `release/Zenx-MultiLogin-Setup.exe`.
2. Escolha a pasta (padrão: `%LOCALAPPDATA%\Programs\Zenx MultiLogin`) e conclua.
3. Abra pelo atalho **Zenx MultiLogin** na área de trabalho ou no menu Iniciar.

Não é necessário Node.js, terminal nem navegador externo. O Chromium já vem no instalador.

### Onde ficam os dados

| O quê | Caminho |
| --- | --- |
| Banco SQLite | `%LOCALAPPDATA%\ZenxMultiLogin\database\zenx.db` |
| Navegador de cada perfil | `%LOCALAPPDATA%\ZenxMultiLogin\profiles\<UUID>\user-data` |

Atualizar ou desinstalar o aplicativo **não apaga** esses dados. Para removê-los de vez,
apague a pasta `%LOCALAPPDATA%\ZenxMultiLogin` manualmente.

## Desenvolvimento

Requisitos: Node.js 22.16+ e Windows x64.

```bash
npm install
npm run chromium   # baixa o Chromium gerenciado para resources/chromium (uma vez)
npm run dev        # abre o app com recarga automática
```

| Comando | Função |
| --- | --- |
| `npm run dev` | App em desenvolvimento (Vite usa localhost só aqui) |
| `npm run build` | Gera `out/` (main, preload e renderer) |
| `npm start` | Abre o build de produção local |
| `npm test` | Build + todos os testes (unitários, Chromium real e ponta a ponta) |
| `npm run test:unit` | Somente testes rápidos de serviços e filtros |
| `npm run typecheck` | Verificação de tipos |
| `npm run db:generate` | Gera migração após alterar `src/main/db/schema.ts` |
| `npm run icons` | Regenera ícones a partir de `assets/brand/logo.webp` |
| `npm run dist` | Ícones + Chromium + build + instalador em `release/` |
| `npm run verify:install` | Instala, abre, desinstala e confere o instalador |

## Arquitetura

```
src/
  shared/      tipos, validação Zod, contrato IPC, filtros (sem Node)
  main/        processo principal do Electron
    services/  ProfileManager, BrowserManager, GroupManager,
               DatabaseService, SettingsService, EventLogger, ChromiumLocator
    ipc/       registro e validação de todos os canais IPC
    db/        schema Drizzle
  preload/     ponte mínima `window.zenx` (invoke / on, lista de canais permitidos)
  renderer/    React + Tailwind + Radix (shadcn/ui) + Zustand + Motion
drizzle/       migrações SQL
scripts/       Chromium, ícones, verificação do instalador
tests/         Vitest
```

### Como o navegador é aberto

O `BrowserManager` inicia o `chrome.exe` gerenciado como um **processo comum**, com
`--user-data-dir` exclusivo do perfil. Ele não usa protocolo de depuração nem pipe de
automação. Por isso sites como o login do Google tratam a janela como um navegador
normal (`navigator.webdriver === false`, verificado nos testes).

- Abrir: reserva o perfil, inicia o processo e acompanha o término.
- Focar: traz a janela existente para frente (Win32 via PowerShell).
- Fechar: encerramento normal (`WM_CLOSE`), que grava a sessão. Força apenas se não responder.
- Fechamento manual pelo usuário é detectado pelo término do processo.

O Playwright continua no projeto para baixar o Chromium e nos testes, mas não controla os
navegadores do usuário.

O sandbox do Chromium no Windows exige que a pasta do navegador seja legível por
AppContainers (o instalador do Google Chrome faz o mesmo). O app aplica essa permissão
(`icacls ... *S-1-15-2-1:(RX)`) na pasta do Chromium gerenciado antes da primeira abertura.
O sandbox permanece **ativo**. Não usamos `--no-sandbox`.

### Segurança

- Renderer com `contextIsolation`, `sandbox` e sem `nodeIntegration`; DevTools desativado no pacote.
- Cada mensagem IPC é validada com Zod, e só o frame principal do painel pode enviá-las.
- CSP restritiva no build (`default-src 'none'`, sem scripts remotos ou inline).
- Painel bloqueia navegação externa, novas janelas, `<webview>` e pedidos de permissão.
- IDs são UUIDs validados; caminhos são confinados à pasta de perfis.
- URLs iniciais aceitam apenas HTTPS.
- Senhas, cookies e tokens nunca são gravados no banco nem nos logs.

## Funcionalidades

- Dashboard com indicadores reais, acesso rápido, perfis recentes e atividade.
- Perfis: criar, editar, duplicar (só o cadastro, com navegador novo e vazio), excluir com confirmação.
- **Várias plataformas por perfil** (Instagram, TikTok, Facebook, X, YouTube, Outra); a primeira define a URL inicial.
- Abrir, focar e fechar navegadores, inclusive vários de uma vez.
- Busca (Ctrl+K), filtros por plataforma, grupo e status, ordenação, seleção e paginação.
- Status em tempo real: Fechado, Iniciando, Aberto, Encerrando, Erro.
- Grupos com 11 cores (inclui vermelho, roxo e verde) e tags múltiplas.
- Configurações: iniciar maximizado, confirmar ao fechar, última página, limite de navegadores,
  avisos de consumo, verificação de integridade (SHA-256) do Chromium, encerrar todos.
- Ao fechar o painel com navegadores abertos, pede confirmação e encerra todos.

## Testes

`npm test` executa 41 testes, incluindo:

- criação automática do banco e migração de bancos da versão anterior;
- dois perfis em processos separados, sem compartilhar cookies nem localStorage
  (página HTTP local, sem redes sociais reais);
- persistência após fechar e reabrir;
- clique duplo sem duplicatas, detecção de fechamento manual, limite simultâneo, recuperação de falha;
- ausência do sinal de automação (`navigator.webdriver`);
- app Electron real: painel via `file://` sem localhost, proteções do renderer, criação pela interface,
  validação, busca e abertura/fechamento de um Chromium.

`npm run verify:install` valida o instalador: executável, atalhos, abertura, ausência de servidor local
e desinstalação preservando os dados.

## Limitações conhecidas

- **Instalador não assinado**: o Windows SmartScreen pode exibir um aviso na primeira execução
  (“Mais informações” → “Executar assim mesmo”). Para distribuir, assine com um certificado de código.
- **Chrome for Testing**: o navegador é a build oficial “Chrome for Testing”, mostrada no título da janela.
  Ela não tem atualização automática, então a versão só muda ao gerar um novo instalador.
- O isolamento separa armazenamento e processos. **Não é garantia de anonimato**: sites ainda podem
  relacionar contas por IP, dispositivo ou comportamento.
- Sites podem encerrar sessões por conta própria. Nesse caso é preciso fazer login de novo.
- Somente Windows x64 nesta versão. Tema apenas escuro.
- O diretório de dados é somente leitura nas configurações.
- Não há limite fixo de navegadores simultâneos: depende da memória e dos sites abertos.
