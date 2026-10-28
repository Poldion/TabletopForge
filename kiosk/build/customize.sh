#!/bin/bash
# Erstellt das Kiosk-Image aus dem offiziellen Raspberry Pi OS Lite (64-bit).
# Erwartet: /kiosk (Projektordner kiosk/, nur lesend), /work (Arbeitsbereich), /out (Ausgabe)
set -euo pipefail

BASE_URL=${BASE_IMAGE_URL:-https://downloads.raspberrypi.com/raspios_lite_arm64_latest}
EXTRA_MB=${EXTRA_MB:-2560}
VERSION=${KIOSK_VERSION:-dev}
WORK=/work
ROOT=$WORK/mnt
IMG=$WORK/kiosk.img
LOOPS=()

cleanup() {
  set +e
  for d in dev/pts dev sys proc boot/firmware; do mountpoint -q "$ROOT/$d" && umount -l "$ROOT/$d"; done
  mountpoint -q "$ROOT" && umount -l "$ROOT"
  for l in "${LOOPS[@]}"; do losetup -d "$l"; done
}
trap cleanup EXIT

mkdir -p "$WORK" /out "$ROOT"
cd "$WORK"

# 1. Basis-Image laden (wird im Arbeitsbereich zwischengespeichert)
if [ ! -f base.img ]; then
  echo ">> Lade Raspberry Pi OS Lite: $BASE_URL"
  curl -fL --retry 3 -o base.img.xz "$BASE_URL"
  curl -fsIL "$BASE_URL" | grep -i '^location:' | tail -1 | tr -d '\r' > base.source || true
  xz -d -T0 base.img.xz
fi
echo ">> Basis: $(cat base.source 2>/dev/null || echo "$BASE_URL")"

# 2. Kopie vergrößern und Root-Partition erweitern
cp --sparse=always base.img "$IMG"
truncate -s +"${EXTRA_MB}M" "$IMG"
parted -s "$IMG" resizepart 2 100%

# Startsektor und Größe (in 512-Byte-Sektoren) einer Partition
part() { partx -g -o START,SECTORS -n "$1" "$IMG" | awk '{print $1, $2}'; }
read -r P1_START P1_SIZE < <(part 1)
read -r P2_START P2_SIZE < <(part 2)
LOOP_BOOT=$(losetup -f --show -o $((P1_START * 512)) --sizelimit $((P1_SIZE * 512)) "$IMG"); LOOPS+=("$LOOP_BOOT")
LOOP_ROOT=$(losetup -f --show -o $((P2_START * 512)) --sizelimit $((P2_SIZE * 512)) "$IMG"); LOOPS+=("$LOOP_ROOT")
e2fsck -fy "$LOOP_ROOT" || true
resize2fs "$LOOP_ROOT"

# 3. Einhängen und Chroot vorbereiten
mount "$LOOP_ROOT" "$ROOT"
mount "$LOOP_BOOT" "$ROOT/boot/firmware"
for d in proc sys dev dev/pts; do mount --bind "/$d" "$ROOT/$d"; done
cp "$ROOT/etc/resolv.conf" "$WORK/resolv.conf.orig" 2>/dev/null || true
rm -f "$ROOT/etc/resolv.conf"; cp /etc/resolv.conf "$ROOT/etc/resolv.conf"
printf '#!/bin/sh\nexit 101\n' > "$ROOT/usr/sbin/policy-rc.d"; chmod +x "$ROOT/usr/sbin/policy-rc.d"

# 4. Kiosk-Dateien einspielen
cp -r /kiosk/files/rootfs/. "$ROOT/"
# Rechte setzen (Dateien aus Windows-Ordnern kommen sonst alle als ausführbar an)
(cd /kiosk/files/rootfs && find . -type f) | while read -r f; do chmod 644 "$ROOT/$f"; done
(cd /kiosk/files/rootfs && find . -type d) | while read -r d; do [ "$d" = "." ] || chmod 755 "$ROOT/$d"; done
chmod 755 "$ROOT/opt/kiosk/agent.py" "$ROOT/usr/local/bin/kiosk-browser" "$ROOT"/usr/local/sbin/kiosk-*
# Private Voreinstellungen (WLAN, Server-Adresse) aus kiosk.local.json über die Vorlage legen
if [ -f /kiosk/kiosk.local.json ]; then
  echo ">> Übernehme private Voreinstellungen aus kiosk.local.json"
  jq -s '.[0] * .[1]' /kiosk/files/boot/kiosk.json /kiosk/kiosk.local.json > "$ROOT/boot/firmware/kiosk.json"
  PRIVATE=1
else
  cp /kiosk/files/boot/kiosk.json "$ROOT/boot/firmware/kiosk.json"
  PRIVATE=0
fi
jq '{serverUrl, hostname, country, wifi: [.wifi[]? | {ssid}]}' "$ROOT/boot/firmware/kiosk.json"
# Sicherungskopie von Anfang an mitliefern
cp "$ROOT/boot/firmware/kiosk.json" "$ROOT/boot/firmware/kiosk.json.bak"
echo "$VERSION" > "$ROOT/opt/kiosk/VERSION"

# 5. Pakete und Systemeinstellungen im Chroot (ARM-Emulation)
cp /usr/local/bin/inside-chroot.sh "$ROOT/tmp/inside-chroot.sh"
chroot "$ROOT" /bin/bash /tmp/inside-chroot.sh
rm -f "$ROOT/tmp/inside-chroot.sh" "$ROOT/usr/sbin/policy-rc.d"

# 6. Boot-Konfiguration: ruhiger Start, kein Bildschirmschoner auf der Konsole
CMDLINE="$ROOT/boot/firmware/cmdline.txt"
for opt in consoleblank=0 logo.nologo vt.global_cursor_default=0 quiet loglevel=3; do
  grep -qw "$opt" "$CMDLINE" || sed -i "1 s/\$/ $opt/" "$CMDLINE"
done
CONFIG_TXT="$ROOT/boot/firmware/config.txt"
# Eigene Zeilen in einer [all]-Sektion, damit sie unabhängig von vorherigen Modell-Filtern gelten
grep -q '^disable_splash=1' "$CONFIG_TXT" || printf '\n[all]\n# Kiosk\ndisable_splash=1\n' >> "$CONFIG_TXT"
# Grafikspeicher (CMA) 256 MB: nötig für das GPU-Zeichnen; ungenutzter CMA-Speicher bleibt für das System nutzbar
sed -i 's/^dtoverlay=vc4-kms-v3d$/dtoverlay=vc4-kms-v3d,cma-256/' "$CONFIG_TXT"
# Bluetooth wird nicht gebraucht (UART frei, weniger Treiber)
grep -q '^dtoverlay=disable-bt' "$CONFIG_TXT" || printf 'dtoverlay=disable-bt\n' >> "$CONFIG_TXT"
grep -E '^dtoverlay=' "$CONFIG_TXT"

rm -f "$ROOT/etc/resolv.conf"
if [ -f "$WORK/resolv.conf.orig" ]; then cp "$WORK/resolv.conf.orig" "$ROOT/etc/resolv.conf"; fi
sync
cleanup
trap - EXIT

# 7. Komprimieren
NAME="tabletop-forge-kiosk-${VERSION}-$(date +%Y%m%d)"
# Images mit WLAN-Passwort deutlich kennzeichnen – nicht weitergeben!
[ "$PRIVATE" = 1 ] && NAME="${NAME}-privat"
echo ">> Komprimiere nach /out/$NAME.img.xz"
xz -T0 -6 -c "$IMG" > "/out/$NAME.img.xz"
sha256sum "/out/$NAME.img.xz" | sed 's#/out/##' > "/out/$NAME.img.xz.sha256"
rm -f "$IMG"
ls -lh /out
