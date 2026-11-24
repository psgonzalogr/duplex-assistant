# Instalador de Duplex Assistant para Windows · Desarrollado por SafeTech (https://safe-tech.cl)
# Uso (PowerShell):
#   irm https://raw.githubusercontent.com/psgonzalogr/duplex-assistant/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Paso([string]$texto) { Write-Host "  > $texto" -ForegroundColor Cyan }

Write-Host ''
Write-Host '  Duplex Assistant' -ForegroundColor White
Write-Host '  Imprime a doble cara en impresoras sin duplex automatico' -ForegroundColor Gray
Write-Host '  Desarrollado por SafeTech - safe-tech.cl' -ForegroundColor Red
Write-Host ''

Write-Paso 'Buscando la ultima version...'
$rel = Invoke-RestMethod 'https://api.github.com/repos/psgonzalogr/duplex-assistant/releases/latest' -Headers @{ 'User-Agent' = 'duplex-assistant-installer' }
$asset = $rel.assets | Where-Object { $_.name -like 'Duplex-Assistant-Setup-*.exe' } | Select-Object -First 1
if (-not $asset) { throw 'No se encontro el instalador de Windows en la ultima version.' }

$tmp = Join-Path $env:TEMP $asset.name
Write-Paso ("Descargando {0} ({1:N0} MB)..." -f $rel.tag_name, ($asset.size / 1MB))
Invoke-WebRequest $asset.browser_download_url -OutFile $tmp -UseBasicParsing
Unblock-File $tmp

Write-Paso 'Instalando (solo para tu usuario, no pide administrador)...'
Get-Process 'Duplex Assistant' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process $tmp -ArgumentList '/S' -Wait
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

$exe = Join-Path $env:LOCALAPPDATA 'Programs\duplex-assistant\Duplex Assistant.exe'
if (Test-Path $exe) {
  Write-Host ''
  Write-Host '  Listo. Duplex Assistant quedo instalado (acceso directo en el Escritorio y en Inicio).' -ForegroundColor Green
  Start-Process $exe
} else {
  Write-Host '  La instalacion termino, pero no encontre el programa. Buscalo en el menu Inicio.' -ForegroundColor Yellow
}
