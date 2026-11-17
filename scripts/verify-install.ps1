# Valida o instalador do Zenx MultiLogin de ponta a ponta:
#   1. instala em modo silencioso (por usuário)
#   2. confere executável, atalho na área de trabalho e no menu Iniciar
#   3. abre o aplicativo pelo atalho e confere que ele inicia e cria o banco
#   4. desinstala e confere que os dados dos perfis NÃO foram removidos
# Uso: npm run verify:install   (ou -KeepInstalled para manter instalado ao final)
param(
  [string]$Installer = (Join-Path $PSScriptRoot '..\release\Zenx-MultiLogin-Setup.exe'),
  [switch]$KeepInstalled
)
$ErrorActionPreference = 'Stop'
$failures = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { Write-Host "  [OK]    $name" -ForegroundColor Green }
  else { Write-Host "  [FALHA] $name" -ForegroundColor Red; $script:failures++ }
}

$Installer = (Resolve-Path $Installer).Path
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\Zenx MultiLogin'
$exe = Join-Path $installDir 'Zenx MultiLogin.exe'
$uninstaller = Join-Path $installDir 'Uninstall Zenx MultiLogin.exe'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Zenx MultiLogin.lnk'
$startLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Zenx MultiLogin.lnk'
$dataDir = Join-Path $env:LOCALAPPDATA 'ZenxMultiLogin'
$database = Join-Path $dataDir 'database\zenx.db'

if (Get-Process -Name 'Zenx MultiLogin' -ErrorAction SilentlyContinue) {
  throw 'Feche o Zenx MultiLogin antes de executar a verificação.'
}

Write-Host "Instalando $Installer ..."
Start-Process -FilePath $Installer -ArgumentList '/S' -Wait
Check 'Executável instalado' (Test-Path $exe)
Check 'Executável fora da pasta de dados do usuário' (-not $exe.StartsWith($dataDir))

$shell = New-Object -ComObject WScript.Shell
Check 'Atalho na área de trabalho' (Test-Path $desktopLink)
Check 'Atalho no menu Iniciar' (Test-Path $startLink)
if (Test-Path $desktopLink) {
  Check 'Atalho aponta para o executável' ($shell.CreateShortcut($desktopLink).TargetPath -eq $exe)
}
Check 'Chromium gerenciado incluído' (Test-Path (Join-Path $installDir 'resources\chromium\manifest.json'))
Check 'Migrações incluídas' (Test-Path (Join-Path $installDir 'resources\drizzle\meta\_journal.json'))

Write-Host 'Abrindo o aplicativo pelo atalho...'
$target = $shell.CreateShortcut($desktopLink).TargetPath
$proc = Start-Process -FilePath $target -PassThru
$window = $null
for ($i = 0; $i -lt 30 -and -not $window; $i++) {
  Start-Sleep -Milliseconds 500
  $window = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Zenx MultiLogin' }
}
Check 'Aplicativo abriu a janela "Zenx MultiLogin"' ($null -ne $window)
Check 'Banco de dados local criado' (Test-Path $database)
$listening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'Zenx MultiLogin' }
Check 'Nenhum servidor HTTP/localhost aberto pelo aplicativo' ($null -eq $listening)
Get-Process -Name 'Zenx MultiLogin' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

if (-not $KeepInstalled) {
  Write-Host 'Desinstalando...'
  Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait
  for ($i = 0; $i -lt 20 -and (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
  Check 'Executável removido' (-not (Test-Path $exe))
  Check 'Atalho da área de trabalho removido' (-not (Test-Path $desktopLink))
  Check 'Dados dos perfis preservados após desinstalar' (Test-Path $database)
}

if ($failures -gt 0) { Write-Host "$failures verificação(ões) falharam." -ForegroundColor Red; exit 1 }
Write-Host 'Instalador validado.' -ForegroundColor Green
