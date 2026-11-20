# Zenx MultiLogin

Aplicativo desktop para Windows 10/11 (x64) que gerencia perfis de navegador isolados.
Cada perfil abre um **Chromium real e independente**, com cookies, localStorage e sessões
próprios, para você fazer login manualmente e reutilizar a sessão depois.

Cada perfil pode sair pela internet com um **proxy próprio** (HTTP, HTTPS ou SOCKS5, com ou sem
usuário e senha): residencial, datacenter, móvel ou ISP.

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

### Proxies

- Biblioteca de proxies (página **Proxies**): criar, editar, excluir, importar em massa e verificar.
- No formulário do perfil: **Sem proxy**, **Proxy salvo** ou **Novo proxy** (o novo também entra na biblioteca).
- Formatos aceitos ao colar ou importar: `host:porta`, `host:porta:usuário:senha`, `usuário:senha@host:porta`
  e `tipo://usuário:senha@host:porta` (`http`, `https`, `socks5`, `socks5h`).
- **Verificar**: abre uma conexão pelo proxy até um serviço público de IP (ipinfo.io, com ipwho.is como
  alternativa) e mostra IP de saída, país, região, cidade e latência. A consulta sai pelo proxy, nunca pela sua conexão.
- **Trocar IP**: chama a URL de rotação do provedor (proxies móveis e rotativos).

Como o navegador usa o proxy:

- Sem usuário e senha: o Chromium recebe `--proxy-server=tipo://host:porta` diretamente.
- Com usuário e senha: o Chromium não aceita credenciais na linha de comando (nem SOCKS5 autenticado).
  O app abre uma **ponte SOCKS5 local** em `127.0.0.1` (porta aleatória, só loopback) que autentica no proxy
  real. Ela existe apenas enquanto o navegador daquele perfil está aberto.
- Em ambos: DNS resolvido pelo proxy (`--host-resolver-rules`) e WebRTC sem UDP fora do proxy, para não
  vazar o IP real.
- A senha do proxy é cifrada com DPAPI do Windows (`safeStorage`) antes de ir para o banco e nunca é
  enviada ao painel. Um banco copiado para outra conta do Windows não revela a senha.

### Região do navegador (fuso, idioma e geolocalização)

Cada perfil escolhe a **Região do navegador**:

| Modo | O que acontece ao abrir |
| --- | --- |
| Do computador | Nada é alterado. |
| Pelo IP do proxy | O proxy é verificado na hora; o navegador recebe o fuso, o idioma do país e as coordenadas do IP de saída. **Se o proxy não responder, o navegador não abre**, para não expor a localização real. |
| Manual | Fuso (IANA), idioma e latitude/longitude/precisão escolhidos. Campos vazios não são alterados. |

Ao escolher um proxy no perfil, a região passa automaticamente para "Pelo IP do proxy".

Como é aplicado, sem automação (o login do Google continua funcionando):

- **Idioma**: `--lang` e a preferência de idiomas do perfil. Afeta `navigator.language(s)`, o cabeçalho
  `Accept-Language`, os formatos do `Intl` e a interface do navegador. Voltar para "Do computador" desfaz só o que o app aplicou.
- **Fuso horário**: o Chromium no Windows ignora a variável `TZ`. Por isso uma extensão local do perfil
  (`profiles/<UUID>/region-extension`, carregada com `--load-extension`) injeta em todas as páginas e frames,
  antes dos scripts do site, um ajuste de `Date`, `Intl.DateTimeFormat` e `Temporal.Now`. Os testes comparam
  com o `Intl` nativo em 8 fusos, incluindo mudanças de horário de verão e fusos de 30/45 minutos.
- **Geolocalização**: a mesma extensão responde `navigator.geolocation` com as coordenadas e informa a
  permissão como concedida.

### Segurança

- Renderer com `contextIsolation`, `sandbox` e sem `nodeIntegration`; DevTools desativado no pacote.
- Cada mensagem IPC é validada com Zod, e só o frame principal do painel pode enviá-las.
- CSP restritiva no build (`default-src 'none'`, sem scripts remotos ou inline).
- Painel bloqueia navegação externa, novas janelas, `<webview>` e pedidos de permissão.
- IDs são UUIDs validados; caminhos são confinados à pasta de perfis.
- URLs iniciais aceitam apenas HTTPS.
- Senhas de contas, cookies e tokens nunca são gravados no banco nem nos logs. A única senha guardada é a
  do proxy, cifrada pela DPAPI do Windows.

## Funcionalidades

- Dashboard com indicadores reais, acesso rápido, perfis recentes e atividade.
- Perfis: criar, editar, duplicar (só o cadastro, com navegador novo e vazio), excluir com confirmação.
- **Várias plataformas por perfil** (Instagram, TikTok, Facebook, X, YouTube, Outra); a primeira define a URL inicial.
- Abrir, focar e fechar navegadores, inclusive vários de uma vez.
- Busca (Ctrl+K), filtros por plataforma, grupo e status, ordenação, seleção e paginação.
- Status em tempo real: Fechado, Iniciando, Aberto, Encerrando, Erro.
- Proxy por perfil (HTTP, HTTPS, SOCKS5, com autenticação), verificação de IP/localização, troca de IP e importação.
- Região do navegador por perfil: fuso horário, idioma e geolocalização pelo IP do proxy ou manuais.
- Grupos com 11 cores (inclui vermelho, roxo e verde) e tags múltiplas.
- Configurações: iniciar maximizado, confirmar ao fechar, última página, limite de navegadores,
  avisos de consumo, verificação de integridade (SHA-256) do Chromium, encerrar todos.
- Ao fechar o painel com navegadores abertos, pede confirmação e encerra todos.

## Testes

`npm test` executa 133 testes, incluindo:

- criação automática do banco e migração de bancos da versão anterior;
- dois perfis em processos separados, sem compartilhar cookies nem localStorage
  (página HTTP local, sem redes sociais reais);
- persistência após fechar e reabrir;
- clique duplo sem duplicatas, detecção de fechamento manual, limite simultâneo, recuperação de falha;
- ausência do sinal de automação (`navigator.webdriver`);
- proxies contra servidores SOCKS5/HTTP locais de teste: autenticação, senha errada, porta fechada, tipo errado,
  verificação de IP, ponte local, senha cifrada no banco e Chromium real navegando pelo proxy autenticado;
- região: ajuste de fuso comparado com o `Intl` nativo em 8 fusos (horário de verão, `Date.parse`, setters,
  `toString`), e Chromium real com fuso, idioma, `Accept-Language`, geolocalização e iframes simulados;
  perfil com proxy fora do ar e região "Pelo IP do proxy" não abre;
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
- **Região simulada tem limites**: o fuso é ajustado em JavaScript nas páginas e frames, mas não em
  Web Workers/Service Workers, que continuam com o fuso do Windows. Scripts antidetecção avançados podem
  notar a substituição. Canvas, WebGL, fontes, resolução e demais itens de impressão digital **não** são alterados.
- A extensão "Zenx Region" aparece em `chrome://extensions` nos perfis com fuso ou geolocalização simulados.
- Com proxy HTTP/HTTPS autenticado, páginas `http://` (sem TLS) passam por CONNECT na porta 80; alguns
  provedores bloqueiam isso. Sites HTTPS não são afetados.
- A ponte local de proxies autenticados escuta só em `127.0.0.1` enquanto o perfil está aberto; outro programa
  no mesmo computador conseguiria usá-la nesse intervalo.
- Sites podem encerrar sessões por conta própria. Nesse caso é preciso fazer login de novo.
- Somente Windows x64 nesta versão. Tema apenas escuro.
- O diretório de dados é somente leitura nas configurações.
- Não há limite fixo de navegadores simultâneos: depende da memória e dos sites abertos.
