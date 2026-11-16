# Baut das Kiosk-Image unter Windows (Docker Desktop erforderlich).
# Aufruf im Ordner kiosk:
#   powershell -ExecutionPolicy Bypass -File .\build.ps1            Raspberry Pi (Raspberry Pi OS Lite)
#   powershell -ExecutionPolicy Bypass -File .\build.ps1 orangepi   Orange Pi Zero 2W (Armbian)
#
# WLAN und Server-Adresse werden aus kiosk.local.json vorbelegt (wird nicht eingecheckt).
# Fehlt die Datei, fragt das Skript die Werte ab.
param([ValidateSet('pi', 'orangepi')][string]$Board = 'pi')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$version = (Get-Content (Join-Path $here '..\package.json') | ConvertFrom-Json).version
$local = Join-Path $here 'kiosk.local.json'
$dist = Join-Path $here 'dist'

if (-not (Test-Path $local)) {
  Write-Host 'Voreinstellungen für das Image (Enter = Standardwert bzw. überspringen):'
  # Leer lassen geht: der Kiosk fragt die Adresse beim ersten Start in seiner Einrichtung ab
  $server = Read-Host 'Server-Adresse (z.B. http://192.168.1.10:3000, leer = bei der Einrichtung angeben)'
  $hostname = Read-Host 'Hostname [spieltisch]'
  if (-not $hostname) { $hostname = 'spieltisch' }
  $ssid = Read-Host 'WLAN-Name (SSID, leer = kein WLAN vorbelegen)'
  $wifi = @()
  if ($ssid) {
    $secure = Read-Host "WLAN-Passwort für $ssid" -AsSecureString
    $psk = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    $wifi = @(@{ ssid = $ssid; psk = $psk })
  }
  $cfg = [ordered]@{ serverUrl = $server; hostname = $hostname; country = 'DE'; wifi = $wifi }
  # UTF-8 ohne BOM, damit jq die Datei sicher lesen kann
  [IO.File]::WriteAllText($local, ($cfg | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
  Write-Host "Gespeichert in $local (wird nicht eingecheckt)."
}

New-Item -ItemType Directory -Force $dist | Out-Null
docker build -t dnd-kiosk-builder (Join-Path $here 'build')
docker run --rm --privileged `
  -e KIOSK_VERSION=$version `
  -v dnd-kiosk-work:/work `
  -v "${here}:/kiosk:ro" `
  -v "${dist}:/out" `
  dnd-kiosk-builder $Board
Write-Host "Fertig: $dist"
Write-Host 'Hinweis: Ein Image mit "-privat" im Namen enthält dein WLAN-Passwort – nicht weitergeben.'
