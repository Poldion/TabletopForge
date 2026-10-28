#!/bin/sh
# Baut das Kiosk-Image (Linux/macOS mit Docker). Aufruf im Ordner kiosk: ./build.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$HERE/../package.json" | head -1)
LOCAL="$HERE/kiosk.local.json"
if [ ! -f "$LOCAL" ]; then
  echo "Voreinstellungen für das Image (Enter = Standardwert bzw. überspringen):"
  # Leer lassen geht: der Kiosk fragt die Adresse beim ersten Start in seiner Einrichtung ab
  printf 'Server-Adresse (z.B. http://192.168.1.10:3000, leer = bei der Einrichtung angeben): '; read -r SERVER
  printf 'Hostname [spieltisch]: '; read -r HOSTN; HOSTN=${HOSTN:-spieltisch}
  printf 'WLAN-Name (SSID, leer = kein WLAN vorbelegen): '; read -r SSID
  WIFI='[]'
  if [ -n "$SSID" ]; then
    printf 'WLAN-Passwort: '; stty -echo; read -r PSK; stty echo; echo
    WIFI=$(printf '[{"ssid":%s,"psk":%s}]' "$(printf '%s' "$SSID" | sed 's/["\]/\&/g; s/.*/"&"/')" "$(printf '%s' "$PSK" | sed 's/["\]/\&/g; s/.*/"&"/')")
  fi
  printf '{"serverUrl":"%s","hostname":"%s","country":"DE","wifi":%s}
' "$SERVER" "$HOSTN" "$WIFI" > "$LOCAL"
  echo "Gespeichert in $LOCAL (wird nicht eingecheckt)."
fi
mkdir -p "$HERE/dist"
# ARM64-Emulation registrieren (bei Docker Desktop bereits vorhanden)
docker run --rm --privileged tonistiigi/binfmt --install arm64 >/dev/null 2>&1 || true
docker build -t dnd-kiosk-builder "$HERE/build"
docker run --rm --privileged -e KIOSK_VERSION="$VERSION" \
  -v dnd-kiosk-work:/work -v "$HERE:/kiosk:ro" -v "$HERE/dist:/out" dnd-kiosk-builder
echo "Fertig: $HERE/dist"
