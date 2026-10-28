# Baut das schlanke Kiosk-Image (Buildroot) unter Windows.
# Aufruf im Ordner kiosk:  powershell -ExecutionPolicy Bypass -File .\build-buildroot.ps1
#
# Gebaut wird in einer eigenen WSL-Distribution („dnd-buildroot“), die unter D:\WSL liegt –
# Quellen, Zwischenstände und Cache (rund 30 GB) landen also nicht auf C:.
# Fehlt die Distribution, wird sie aus dem Docker-Image debian:trixie-slim angelegt.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$distro = 'dnd-buildroot'
$target = if ($env:KIOSK_WSL_DIR) { $env:KIOSK_WSL_DIR } else { 'D:\WSL\dnd-buildroot' }

$known = (wsl -l -q) -replace "`0", '' | Where-Object { $_.Trim() -eq $distro }
if (-not $known) {
  Write-Host "Lege WSL-Distribution $distro unter $target an …"
  New-Item -ItemType Directory -Force $target | Out-Null
  $tar = Join-Path $target 'rootfs.tar'
  $cid = docker create debian:trixie-slim
  docker export $cid -o $tar
  docker rm $cid | Out-Null
  wsl --import $distro $target $tar --version 2
  Remove-Item $tar
  wsl -d $distro -u root -- bash -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq --no-install-recommends build-essential gcc g++ make patch perl python3 rsync cpio unzip bc file wget curl ca-certificates git which bzip2 xz-utils gzip libncurses-dev jq libssl-dev gawk mtools && useradd -m -s /bin/bash br && printf '[user]\ndefault=br\n[interop]\nappendWindowsPath=false\n' > /etc/wsl.conf"
  wsl --terminate $distro
}

$script = (wsl -d $distro -- wslpath -a ($here -replace '\\', '/')).Trim() + '/buildroot/build.sh'
wsl -d $distro -- bash "$script"
if ($LASTEXITCODE -ne 0) { throw "Build fehlgeschlagen" }
Write-Host "Fertig: $here\dist"
Write-Host 'Hinweis: Ein Image mit "-privat" im Namen enthält dein WLAN-Passwort – nicht weitergeben.'
