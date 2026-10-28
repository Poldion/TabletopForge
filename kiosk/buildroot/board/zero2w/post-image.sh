#!/bin/bash
# SD-Karten-Image zusammenbauen: Boot-Partition (Firmware, kiosk.json, Systemplatz a/ mit Kernel) +
# Root-Dateisystem (Platz A) – und das Update-Paket für die Verteilung über den Server (kiosk-update.kup).
set -euo pipefail
BOARD_DIR="$(dirname "$0")"
KIOSK_DIR="$BR2_EXTERNAL_DND_KIOSK_PATH/kiosk-files"

# kiosk.json: Vorlage, optional mit privaten Voreinstellungen (WLAN, Server) aus kiosk.local.json
if [ -f "$KIOSK_DIR/kiosk.local.json" ]; then
  echo ">> Übernehme private Voreinstellungen aus kiosk.local.json"
  jq -s '.[0] * .[1]' "$KIOSK_DIR/boot/kiosk.json" "$KIOSK_DIR/kiosk.local.json" > "$BINARIES_DIR/kiosk.json"
else
  cp "$KIOSK_DIR/boot/kiosk.json" "$BINARIES_DIR/kiosk.json"
fi
cp "$BINARIES_DIR/kiosk.json" "$BINARIES_DIR/kiosk.json.bak"
jq '{serverUrl, hostname, country, wifi: [.wifi[]? | {ssid}]}' "$BINARIES_DIR/kiosk.json"

# Systemplatz A: Kernel, Gerätebaum, Overlays, cmdline.txt (die Firmware lädt sie über os_prefix=a/)
SLOT="$BINARIES_DIR/slot-a"
rm -rf "$SLOT"
mkdir -p "$SLOT"
cp "$BINARIES_DIR/Image" "$BINARIES_DIR/bcm2710-rpi-zero-2-w.dtb" "$BINARIES_DIR/rpi-firmware/cmdline.txt" "$SLOT/"
cp -r "$BINARIES_DIR/rpi-firmware/overlays" "$SLOT/"

# Update-Paket (tar): manifest.json zuerst, dann boot.tar (Inhalt eines Systemplatzes ohne cmdline.txt –
# die schreibt der Agent passend zum Zielplatz) und rootfs.squashfs. Enthält keine privaten Daten.
UPD="$BINARIES_DIR/update"
rm -rf "$UPD"
mkdir -p "$UPD"
tar -C "$SLOT" --exclude=./cmdline.txt --owner=0 --group=0 -cf "$UPD/boot.tar" .
cp "$BINARIES_DIR/rootfs.squashfs" "$UPD/rootfs.squashfs"
VERSION="$(cat "$TARGET_DIR/opt/kiosk/VERSION" 2>/dev/null || echo 0)"
entry() { # entry <datei>
  printf '{ "file": "%s", "size": %s, "sha256": "%s" }' "$1" "$(stat -c %s "$UPD/$1")" "$(sha256sum "$UPD/$1" | cut -d' ' -f1)"
}
printf '{\n  "format": 1,\n  "board": "zero2w",\n  "version": "%s",\n  "created": "%s",\n  "boot": %s,\n  "rootfs": %s\n}\n' \
  "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(entry boot.tar)" "$(entry rootfs.squashfs)" > "$UPD/manifest.json"
tar -C "$UPD" --owner=0 --group=0 -cf "$BINARIES_DIR/kiosk-update.kup" manifest.json boot.tar rootfs.squashfs
rm -rf "$UPD"
echo ">> Update-Paket $VERSION: $(du -h "$BINARIES_DIR/kiosk-update.kup" | cut -f1)"

GENIMAGE_TMP="${BUILD_DIR}/genimage.tmp"
ROOTPATH_TMP="$(mktemp -d)"
trap 'rm -rf "${ROOTPATH_TMP}"' EXIT
rm -rf "${GENIMAGE_TMP}"
genimage \
  --rootpath "${ROOTPATH_TMP}" \
  --tmppath "${GENIMAGE_TMP}" \
  --inputpath "${BINARIES_DIR}" \
  --outputpath "${BINARIES_DIR}" \
  --config "${BOARD_DIR}/genimage.cfg"
